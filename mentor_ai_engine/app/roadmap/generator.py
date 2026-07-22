import json
import re
import uuid

from app.llm_client import llm_client
from app.metrics import record_event
from app.models import LearnerProfile, Roadmap, RoadmapMilestone, RoadmapTopic
from app.roadmap.prompts import (
    MILESTONE_SYSTEM_PROMPT,
    TOPIC_SYSTEM_PROMPT,
    build_milestone_user_prompt,
    build_topic_user_prompt,
    render_profile_summary,
)

MILESTONES_BLOCK_RE = re.compile(r"<MILESTONES>(.*?)</MILESTONES>", re.DOTALL)
TOPICS_BLOCK_RE = re.compile(r"<TOPICS>(.*?)</TOPICS>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1  # one corrective retry per pass, matching Phase 1's tolerance for one bad turn


class RoadmapGenerationError(Exception):
    """Raised when the LLM fails to produce a parseable roadmap after retries.
    Caller (router) decides how to degrade — currently falls back to mock output
    rather than surfacing a 500 to other teams' in-progress builds."""


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_json_block(raw_reply: str, pattern: re.Pattern) -> list | None:
    match = pattern.search(raw_reply)
    if not match:
        return None
    json_str = _strip_code_fences(match.group(1).strip())
    try:
        data = json.loads(json_str)
        if not isinstance(data, list):
            return None
        return data
    except (json.JSONDecodeError, TypeError):
        return None


class RoadmapGenerator:
    """
    Two-pass roadmap generation:
      Pass 1 — coarse milestone sequence for the whole goal.
      Pass 2 — per-milestone topic expansion, aware of topics already
                generated in earlier milestones so it can reference them
                as prerequisites (building the topic DAG required by Phase 4).

    All topic_id/milestone_id assignment happens here, not in the LLM output,
    so prerequisite references are guaranteed to resolve to real ids — the
    model only ever refers to prerequisites by exact title text, which we
    map to ids ourselves after generation.
    """

    def __init__(self):
        self._next_topic_num = 1

    def generate(self, user_id: str, profile: LearnerProfile) -> Roadmap:
        self._next_topic_num = 1
        profile_summary = render_profile_summary(profile)

        milestone_titles = self._generate_milestone_titles(profile_summary)

        all_milestones: list[RoadmapMilestone] = []
        # title -> topic_id, accumulated across milestones so later milestones
        # (and later topics within the same milestone) can reference earlier ones.
        title_to_id: dict[str, str] = {}
        prior_topic_titles: list[str] = []

        for idx, milestone_title in enumerate(milestone_titles):
            raw_topics = self._generate_topics_for_milestone(
                profile_summary=profile_summary,
                milestone_title=milestone_title,
                milestone_index=idx,
                total_milestones=len(milestone_titles),
                prior_topic_titles=prior_topic_titles,
            )

            milestone_id = f"m{idx + 1}"
            topics: list[RoadmapTopic] = []

            for raw_topic in raw_topics:
                topic_id = f"t{self._next_topic_num}"
                self._next_topic_num += 1

                title = str(raw_topic.get("title", "")).strip() or f"Untitled Topic {topic_id}"
                title_to_id[title.lower()] = topic_id

                raw_prereqs = raw_topic.get("prerequisites", []) or []
                resolved_prereqs = [
                    title_to_id[p.strip().lower()]
                    for p in raw_prereqs
                    if isinstance(p, str) and p.strip().lower() in title_to_id
                    # guards against the model inventing a prerequisite that
                    # isn't an already-assigned id yet (e.g. forward reference
                    # or hallucinated title) — silently dropped rather than
                    # crashing the whole roadmap generation
                ]

                status = self._resolve_status(title, resolved_prereqs, profile.known_skills)

                try:
                    estimated_hours = int(raw_topic.get("estimated_hours", 4))
                except (TypeError, ValueError):
                    estimated_hours = 4
                estimated_hours = max(1, min(estimated_hours, 40))

                topics.append(RoadmapTopic(
                    topic_id=topic_id,
                    title=title,
                    description=str(raw_topic.get("description", "")).strip()
                    or "No description generated.",
                    estimated_hours=estimated_hours,
                    status=status,
                    prerequisites=resolved_prereqs,
                ))
                prior_topic_titles.append(title)

            if not topics:
                # Degenerate case: pass 2 returned an empty/unusable list for this
                # milestone. Insert a single placeholder so the milestone isn't empty
                # rather than dropping the whole milestone silently.
                topic_id = f"t{self._next_topic_num}"
                self._next_topic_num += 1
                topics.append(RoadmapTopic(
                    topic_id=topic_id,
                    title=f"{milestone_title} — Core Work",
                    description="Placeholder topic — the model did not return usable topic detail for this milestone.",
                    estimated_hours=6,
                    status="available",
                    prerequisites=[],
                ))

            all_milestones.append(RoadmapMilestone(
                milestone_id=milestone_id,
                title=milestone_title,
                topics=topics,
                checkpoint_quiz_id=f"quiz-{milestone_id}",
            ))

        return Roadmap(
            roadmap_id=f"roadmap-{uuid.uuid4().hex[:12]}",
            user_id=user_id,
            goal=profile.goal,
            milestones=all_milestones,
            progress_percent=0.0,
        )

    # ---------- internals ----------

    @staticmethod
    def _resolve_status(title: str, prerequisites: list[str], known_skills: list[str]) -> str:
        # Was: a loose bidirectional substring match ("python" in "python
        # basics" or vice versa), which marked topics — and any milestone
        # made up entirely of such topics — as "completed" the instant the
        # roadmap was generated, before the learner had done anything.
        # Knowing a skill in general doesn't mean this specific curriculum
        # topic is already mastered, so this now only auto-completes on a
        # genuine exact match (case/whitespace-insensitive) between the
        # topic title and a reported known skill.
        title_norm = " ".join(title.strip().lower().split())
        for skill in known_skills:
            skill_norm = " ".join(skill.strip().lower().split())
            if skill_norm and skill_norm == title_norm:
                return "completed"
        return "available" if not prerequisites else "locked"

    def _generate_milestone_titles(self, profile_summary: str) -> list[str]:
        messages = [
            {"role": "system", "content": MILESTONE_SYSTEM_PROMPT},
            {"role": "user", "content": build_milestone_user_prompt(profile_summary)},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(messages, temperature=0.6, max_tokens=600)
            data = _extract_json_block(raw_reply, MILESTONES_BLOCK_RE)
            titles = self._coerce_milestone_titles(data)
            if titles:
                return titles

            print(f"[roadmap] Failed to parse milestones (attempt {attempt + 1}). Raw reply:\n{raw_reply}")
            record_event("roadmap_milestone_parse_failure", attempt=attempt + 1)
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed as valid JSON inside a single "
                    "<MILESTONES>...</MILESTONES> block. Output ONLY that block, valid JSON, "
                    "nothing else."
                ),
            })

        raise RoadmapGenerationError("Could not generate a valid milestone sequence after retries.")

    @staticmethod
    def _coerce_milestone_titles(data) -> list[str] | None:
        if not data:
            return None
        titles = []
        for item in data:
            if isinstance(item, dict) and item.get("title"):
                titles.append(str(item["title"]).strip())
            elif isinstance(item, str) and item.strip():
                titles.append(item.strip())
        return titles or None

    def _generate_topics_for_milestone(
        self,
        profile_summary: str,
        milestone_title: str,
        milestone_index: int,
        total_milestones: int,
        prior_topic_titles: list[str],
    ) -> list[dict]:
        messages = [
            {"role": "system", "content": TOPIC_SYSTEM_PROMPT},
            {"role": "user", "content": build_topic_user_prompt(
                profile_summary=profile_summary,
                milestone_title=milestone_title,
                milestone_index=milestone_index,
                total_milestones=total_milestones,
                prior_topic_titles=prior_topic_titles,
            )},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(messages, temperature=0.6, max_tokens=1600)
            data = _extract_json_block(raw_reply, TOPICS_BLOCK_RE)
            if data:
                valid = [item for item in data if isinstance(item, dict) and item.get("title")]
                if valid:
                    return valid

            print(
                f"[roadmap] Failed to parse topics for milestone '{milestone_title}' "
                f"(attempt {attempt + 1}). Raw reply:\n{raw_reply}"
            )
            record_event("roadmap_topic_parse_failure", milestone=milestone_title, attempt=attempt + 1)
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed as valid JSON inside a single "
                    "<TOPICS>...</TOPICS> block. Output ONLY that block, valid JSON, nothing else."
                ),
            })

        # Don't blow up the whole roadmap over one bad milestone — caller inserts
        # a placeholder topic if this comes back empty.
        return []


roadmap_generator = RoadmapGenerator()
