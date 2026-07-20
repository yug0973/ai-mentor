"""
Phase 7: Weekly Review Generator.

Reads a user's Phase 3 session history + mastery scores (app/memory/store.py)
and aggregates the past week into sessions_completed, total_hours,
topics_improved/stagnant, and goal_progress_percent — all fully deterministic
(app/reviews/rules.py). A small targeted LLM call (app/reviews/prompts.py)
then writes the two free-text fields (next_week_focus, motivational_insight)
from those facts. Same "rule decides the facts, LLM only writes copy" shape
as app/nudges/engine.py and app/adaptive/engine.py.

A brand-new user with zero session history ever gets a fully deterministic
response (all zeros + a generic "get started" message) with no LLM call at
all — there's nothing to summarize yet. A user with history but no sessions
in the last 7 days ("quiet week") still gets an LLM-authored message, since
there's real history (goal_progress, past topics) worth referencing.
"""
import re

from app.metrics import record_event
from app.models import WeeklyReviewResponse
from app.reviews import rules
from app.reviews.prompts import REVIEW_SYSTEM_PROMPT, build_review_user_prompt
from app.llm_client import llm_client
from app.memory.store import memory_store
from app.roadmap.store import roadmap_store

NEXT_WEEK_FOCUS_RE = re.compile(r"<NEXT_WEEK_FOCUS>(.*?)</NEXT_WEEK_FOCUS>", re.DOTALL)
MOTIVATIONAL_INSIGHT_RE = re.compile(r"<MOTIVATIONAL_INSIGHT>(.*?)</MOTIVATIONAL_INSIGHT>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:\w+)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1  # matches Phase 4/5/6's tolerance for one bad LLM turn

# Deterministic templated copy used only if the LLM never returns both
# parseable blocks after a retry, or if there's no session history at all to
# call the LLM about in the first place — same "the rule layer's facts must
# not be dropped over an LLM hiccup" principle as Phase 6's nudge fallback.
NO_HISTORY_FOCUS = "Get started with your roadmap's first topic whenever you're ready."
NO_HISTORY_INSIGHT = "No sessions logged yet — even a short first session gets the ball rolling."


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_field(raw_reply: str, pattern: re.Pattern) -> str | None:
    match = pattern.search(raw_reply)
    if not match:
        return None
    text = _strip_code_fences(match.group(1).strip()).strip().strip('"')
    return text or None


def _fallback_focus(data: "rules.WeeklyReviewData", focus_title: str | None) -> str:
    if focus_title:
        return f"Focus on {focus_title} next week — extra reps should help it stick."
    return "Keep working steadily through your roadmap's next topics."


def _fallback_insight(data: "rules.WeeklyReviewData") -> str:
    if data.sessions_completed == 0:
        return (
            "No sessions logged this week — no judgment, just pick back up whenever "
            "works and the plan will still be here."
        )
    return (
        f"You logged {data.sessions_completed} session(s) and "
        f"{data.total_hours}h this week, putting you at {data.goal_progress_percent}% "
        "toward your goal. Keep the pace going."
    )


class WeeklyReviewEngine:
    def generate(self, user_id: str) -> WeeklyReviewResponse:
        sessions = memory_store.get_sessions(user_id)
        mastery_map = memory_store.get_mastery_map(user_id)

        if not sessions:
            record_event("weekly_review_generated", user_id=user_id, reason="no_history")
            data = rules.compute_weekly_data(sessions, mastery_map, roadmap=None)
            return WeeklyReviewResponse(
                user_id=user_id,
                week_start=data.week_start,
                week_end=data.week_end,
                sessions_completed=data.sessions_completed,
                total_hours=data.total_hours,
                topics_improved=data.topics_improved,
                topics_stagnant=data.topics_stagnant,
                goal_progress_percent=data.goal_progress_percent,
                next_week_focus=NO_HISTORY_FOCUS,
                motivational_insight=NO_HISTORY_INSIGHT,
            )

        roadmap = None
        # Any session carries a roadmap_id; the most recent one is the best
        # guess at the learner's current roadmap (same lookup pattern as
        # app/nudges/engine.py._enrich_context).
        latest_roadmap_id = sorted(sessions, key=lambda s: s.logged_at)[-1].roadmap_id
        if latest_roadmap_id:
            roadmap = roadmap_store.get(latest_roadmap_id)

        data = rules.compute_weekly_data(sessions, mastery_map, roadmap=roadmap)

        titles_by_id = {}
        if roadmap:
            titles_by_id = {t.topic_id: t.title for m in roadmap.milestones for t in m.topics}

        focus_title = titles_by_id.get(data.focus_topic_id, data.focus_topic_id) if data.focus_topic_id else None
        reason = "active_week" if data.sessions_completed > 0 else "quiet_week"

        context = {
            "sessions_completed": data.sessions_completed,
            "total_hours": data.total_hours,
            "goal_progress_percent": data.goal_progress_percent,
            "topics_improved": [titles_by_id.get(t, t) for t in data.topics_improved] or "none",
            "topics_stagnant": [titles_by_id.get(t, t) for t in data.topics_stagnant] or "none",
            "focus_topic": focus_title or "none",
            "reason": reason,
        }

        next_week_focus, motivational_insight = self._generate_text(context, data, focus_title)

        record_event(
            "weekly_review_generated", user_id=user_id, reason=reason,
            sessions_completed=data.sessions_completed,
        )
        return WeeklyReviewResponse(
            user_id=user_id,
            week_start=data.week_start,
            week_end=data.week_end,
            sessions_completed=data.sessions_completed,
            total_hours=data.total_hours,
            topics_improved=data.topics_improved,
            topics_stagnant=data.topics_stagnant,
            goal_progress_percent=data.goal_progress_percent,
            next_week_focus=next_week_focus,
            motivational_insight=motivational_insight,
        )

    # ---------- internals ----------

    def _generate_text(
        self, context: dict, data: "rules.WeeklyReviewData", focus_title: str | None,
    ) -> tuple[str, str]:
        messages = [
            {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
            {"role": "user", "content": build_review_user_prompt(context)},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(messages, temperature=0.6, max_tokens=200)
            focus_text = _extract_field(raw_reply, NEXT_WEEK_FOCUS_RE)
            insight_text = _extract_field(raw_reply, MOTIVATIONAL_INSIGHT_RE)
            if focus_text and insight_text:
                return focus_text, insight_text

            print(
                f"[reviews] Failed to parse weekly review text for user context "
                f"(attempt {attempt + 1}). Raw reply:\n{raw_reply}"
            )
            record_event("weekly_review_parse_failure", attempt=attempt + 1)
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed. Output ONLY the "
                    "<NEXT_WEEK_FOCUS>...</NEXT_WEEK_FOCUS> and "
                    "<MOTIVATIONAL_INSIGHT>...</MOTIVATIONAL_INSIGHT> blocks, nothing else."
                ),
            })

        record_event("weekly_review_fallback")
        return _fallback_focus(data, focus_title), _fallback_insight(data)


weekly_review_engine = WeeklyReviewEngine()
