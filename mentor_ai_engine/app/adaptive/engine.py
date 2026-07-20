"""
Phase 4: Adaptive Roadmap Engine.

Combines the deterministic rule layer (app/adaptive/rules.py — which topics
are weak, whether the milestone passed, what unlocks next) with a targeted
LLM call (app/adaptive/prompts.py) that only generates the CONTENT of new
remediation topics for whichever topics the rules flagged. This is
deliberately NOT a full roadmap regeneration (see README "What Phase 4
does") — same "small, targeted LLM call + code does the bookkeeping" shape
as app/roadmap/generator.py's prerequisite-id resolution.

Reads current mastery from the Phase 3 memory layer (app/memory/store.py) so
adaptation reacts to more than just the single quiz score in isolation.
"""
import json
import re

from app.adaptive import rules
from app.adaptive.prompts import REMEDIATION_SYSTEM_PROMPT, build_remediation_user_prompt
from app.llm_client import llm_client
from app.memory.store import memory_store
from app.metrics import record_event
from app.models import AdaptRoadmapResponse, QuizResult, Roadmap, RoadmapTopic

REMEDIATION_BLOCK_RE = re.compile(r"<REMEDIATION_TOPICS>(.*?)</REMEDIATION_TOPICS>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1  # matches Phase 2's tolerance for one bad LLM turn


class AdaptiveEngineError(Exception):
    """Raised when adaptation can't proceed at all (e.g. unknown
    milestone_id on the roadmap). Caller (router) degrades to mock output
    rather than surfacing a 500 — same pattern as RoadmapGenerationError."""


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_remediation_topics(raw_reply: str) -> list[dict] | None:
    match = REMEDIATION_BLOCK_RE.search(raw_reply)
    if not match:
        return None
    json_str = _strip_code_fences(match.group(1).strip())
    try:
        data = json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, list) or not data:
        return None
    valid = [item for item in data if isinstance(item, dict) and item.get("title")]
    return valid or None


class AdaptiveEngine:
    """
    Mutates the given Roadmap in place (topic statuses, prerequisites,
    estimated_hours, new remediation topics) and returns it wrapped in an
    AdaptRoadmapResponse. Caller (router) is responsible for persisting the
    result back to app/roadmap/store.py.
    """

    def adapt(self, roadmap: Roadmap, quiz_result: QuizResult) -> AdaptRoadmapResponse:
        milestone = next(
            (m for m in roadmap.milestones if m.milestone_id == quiz_result.milestone_id), None
        )
        if milestone is None:
            raise AdaptiveEngineError(
                f"milestone_id {quiz_result.milestone_id!r} not found on roadmap {roadmap.roadmap_id!r}"
            )

        mastery_map = memory_store.get_mastery_map(quiz_result.user_id)

        weak_topics: list[RoadmapTopic] = []
        for topic in milestone.topics:
            quiz_score = quiz_result.topic_breakdown.get(topic.topic_id, quiz_result.score_percent)
            mastery_score = mastery_map.get(topic.topic_id, rules.DEFAULT_MASTERY_PRIOR)
            if rules.is_weak(quiz_score, mastery_score):
                weak_topics.append(topic)
        weak_ids = {t.topic_id for t in weak_topics}

        change_notes: list[str] = []
        changed = False

        if weak_topics:
            remediation_by_topic_id = self._generate_remediation(
                milestone_title=milestone.title,
                weak_topics=weak_topics,
                quiz_result=quiz_result,
            )
            next_num = self._next_topic_number(roadmap)
            new_topics: list[RoadmapTopic] = []
            remediation_ids: set[str] = set()

            for topic in milestone.topics:
                if topic.topic_id not in weak_ids:
                    new_topics.append(topic)
                    continue

                remediation_data = remediation_by_topic_id[topic.topic_id]
                remediation_id = f"t{next_num}"
                next_num += 1

                remediation_topic = RoadmapTopic(
                    topic_id=remediation_id,
                    title=remediation_data["title"],
                    description=remediation_data["description"],
                    estimated_hours=remediation_data["estimated_hours"],
                    status="locked" if topic.prerequisites else "available",
                    prerequisites=list(topic.prerequisites),
                )
                new_topics.append(remediation_topic)
                remediation_ids.add(remediation_id)

                # The original topic now depends on its remediation topic too,
                # and always starts locked again pending that — regardless of
                # whether it was previously available/in_progress/completed.
                topic.prerequisites = list(dict.fromkeys(topic.prerequisites + [remediation_id]))
                topic.estimated_hours = rules.bumped_hours(topic.estimated_hours)
                topic.status = "locked"
                new_topics.append(topic)

                change_notes.append(f'inserted remediation before "{topic.title}"')
                changed = True

            milestone.topics = new_topics
        else:
            remediation_ids = set()

        if rules.milestone_passed(quiz_result.score_percent):
            completed_count = 0
            for topic in milestone.topics:
                if topic.topic_id in weak_ids or topic.topic_id in remediation_ids:
                    # weak topics stay locked behind their new remediation, and
                    # a remediation topic just inserted this pass hasn't been
                    # done yet either — neither should be auto-completed just
                    # because the milestone's overall score passed.
                    continue
                if topic.status != "completed":
                    topic.status = "completed"
                    completed_count += 1
            if completed_count:
                change_notes.append(f"marked {completed_count} topic(s) completed")
                changed = True

        unlocked = self._propagate_unlocks(roadmap)
        if unlocked:
            change_notes.append(f"unlocked {unlocked} topic(s) whose prerequisites are now met")
            changed = True

        roadmap.progress_percent = self._recompute_progress(roadmap)

        if change_notes:
            summary = (
                f'Checkpoint quiz on "{milestone.title}" scored {quiz_result.score_percent:.0f}%: '
                + "; ".join(change_notes) + "."
            )
        else:
            summary = (
                f'Checkpoint quiz on "{milestone.title}" scored {quiz_result.score_percent:.0f}%: '
                "no roadmap changes needed."
            )

        return AdaptRoadmapResponse(
            roadmap_id=roadmap.roadmap_id,
            changed=changed,
            change_summary=summary,
            updated_roadmap=roadmap,
        )

    # ---------- internals ----------

    @staticmethod
    def _next_topic_number(roadmap: Roadmap) -> int:
        max_num = 0
        for m in roadmap.milestones:
            for t in m.topics:
                if t.topic_id.startswith("t") and t.topic_id[1:].isdigit():
                    max_num = max(max_num, int(t.topic_id[1:]))
        return max_num + 1

    def _generate_remediation(
        self, milestone_title: str, weak_topics: list[RoadmapTopic], quiz_result: QuizResult,
    ) -> dict[str, dict]:
        weak_payload = [
            {
                "title": t.title,
                "description": t.description,
                "quiz_score_percent": quiz_result.topic_breakdown.get(t.topic_id, quiz_result.score_percent),
            }
            for t in weak_topics
        ]
        messages = [
            {"role": "system", "content": REMEDIATION_SYSTEM_PROMPT},
            {"role": "user", "content": build_remediation_user_prompt(milestone_title, weak_payload)},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(messages, temperature=0.5, max_tokens=500)
            data = _extract_remediation_topics(raw_reply)
            if data and len(data) >= len(weak_topics):
                return self._coerce_remediation(weak_topics, data)

            print(
                f"[adaptive] Failed to parse remediation topics for milestone "
                f"'{milestone_title}' (attempt {attempt + 1}). Raw reply:\n{raw_reply}"
            )
            record_event(
                "adaptive_remediation_parse_failure", attempt=attempt + 1, milestone=milestone_title,
            )
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed as valid JSON inside a single "
                    "<REMEDIATION_TOPICS>...</REMEDIATION_TOPICS> block, or didn't return one "
                    "item per weak topic. Output ONLY that block, valid JSON, one item per "
                    "weak topic listed, nothing else."
                ),
            })

        # Deterministic fallback — the rule layer already decided these topics
        # need remediation, so don't drop that decision over an LLM hiccup;
        # insert templated copy instead of failing adaptation entirely.
        record_event(
            "adaptive_remediation_fallback", milestone=milestone_title, weak_count=len(weak_topics),
        )
        return {
            t.topic_id: {
                "title": f"{t.title} — Extra Practice",
                "description": (
                    f'Focused review of "{t.title}" before continuing — the checkpoint quiz '
                    "showed this needs more practice."
                ),
                "estimated_hours": max(1, round(t.estimated_hours * 0.5)),
            }
            for t in weak_topics
        }

    @staticmethod
    def _coerce_remediation(weak_topics: list[RoadmapTopic], data: list[dict]) -> dict[str, dict]:
        result = {}
        for topic, item in zip(weak_topics, data):
            try:
                hours = max(1, min(rules.MAX_ESTIMATED_HOURS, int(item.get("estimated_hours", 3))))
            except (TypeError, ValueError):
                hours = 3
            result[topic.topic_id] = {
                "title": str(item.get("title", "")).strip() or f"{topic.title} — Extra Practice",
                "description": str(item.get("description", "")).strip() or "Targeted remediation practice.",
                "estimated_hours": hours,
            }
        return result

    @staticmethod
    def _propagate_unlocks(roadmap: Roadmap) -> int:
        """
        Fixed-point pass: any "locked" topic whose prerequisites are ALL
        "completed" becomes "available". Runs across the whole roadmap (not
        just the adapted milestone) since unlocking a topic in milestone N
        can cascade into milestone N+1. Bounded by total topic count so a
        malformed/cyclical DAG can't loop forever — shouldn't happen given
        app/roadmap/generator.py's prerequisite resolution, but this stays
        safe regardless.
        """
        all_topics = {t.topic_id: t for m in roadmap.milestones for t in m.topics}
        unlocked_count = 0
        for _ in range(len(all_topics)):
            changed_this_pass = False
            for topic in all_topics.values():
                if topic.status != "locked":
                    continue
                if all(
                    all_topics.get(p) is not None and all_topics[p].status == "completed"
                    for p in topic.prerequisites
                ):
                    topic.status = "available"
                    unlocked_count += 1
                    changed_this_pass = True
            if not changed_this_pass:
                break
        return unlocked_count

    @staticmethod
    def _recompute_progress(roadmap: Roadmap) -> float:
        all_topics = [t for m in roadmap.milestones for t in m.topics]
        if not all_topics:
            return 0.0
        completed = sum(1 for t in all_topics if t.status == "completed")
        return round(100.0 * completed / len(all_topics), 2)


adaptive_engine = AdaptiveEngine()
