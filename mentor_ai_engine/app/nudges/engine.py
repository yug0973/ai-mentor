"""
Phase 6: Motivation Detector / Nudges.

Reads a user's Phase 3 session history + mastery scores (app/memory/store.py)
and decides whether a motivational nudge is warranted — combining a fully
deterministic rule layer (app/nudges/rules.py, which decides WHETHER and WHY)
with a small targeted LLM call (app/nudges/prompts.py) that only writes the
nudge_message *text* for whichever reason the rules picked. Same "rule
decides, LLM writes copy" shape as app/adaptive/engine.py.

The LLM is only called when a nudge actually fires — if the rules decide not
to nudge, there's nothing to write copy for, so no LLM call happens at all
(same cost-consciousness as Phase 5's fast path).
"""
import re

from app.metrics import record_event
from app.models import NudgeCheckResponse
from app.nudges import rules
from app.nudges.prompts import NUDGE_SYSTEM_PROMPT, build_nudge_user_prompt
from app.llm_client import llm_client
from app.memory.store import memory_store
from app.roadmap.store import roadmap_store

NUDGE_MESSAGE_RE = re.compile(r"<NUDGE_MESSAGE>(.*?)</NUDGE_MESSAGE>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:\w+)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1  # matches Phase 4/5's tolerance for one bad LLM turn

# Deterministic templated copy used only if the LLM never returns a
# parseable message after a retry — same "the rule layer's decision must
# not be dropped over an LLM hiccup" principle as Phase 4's remediation
# fallback, just applied to nudge text instead of roadmap content.
FALLBACK_MESSAGES = {
    "long_inactivity": "It's been a while since your last session — no pressure, just here whenever you're ready to pick back up.",
    "inactivity": "Haven't seen you in a few days — want to knock out a quick session today?",
    "struggling": "The last few topics have been tough — want to slow down and do a lighter, more focused session next?",
    "frequency_drop": "Noticed your study pace has slowed down a bit lately — everything okay? Happy to adjust the plan if it helps.",
}


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_message(raw_reply: str) -> str | None:
    match = NUDGE_MESSAGE_RE.search(raw_reply)
    if not match:
        return None
    text = _strip_code_fences(match.group(1).strip()).strip().strip('"')
    return text or None


class NudgeEngine:
    def check(self, user_id: str) -> NudgeCheckResponse:
        sessions = memory_store.get_sessions(user_id)
        mastery_map = memory_store.get_mastery_map(user_id)

        decision = rules.detect_nudge(sessions, mastery_map)

        if not decision.triggered:
            record_event(
                "nudge_checked", triggered=False, user_id=user_id, reason=decision.trigger_reason,
            )
            return NudgeCheckResponse(
                nudge_triggered=False,
                trigger_reason=decision.trigger_reason,
            )

        context = self._enrich_context(user_id, sessions, decision)
        message = self._generate_message(decision.trigger_reason, context)

        record_event(
            "nudge_checked", triggered=True, user_id=user_id, reason=decision.trigger_reason,
        )
        return NudgeCheckResponse(
            nudge_triggered=True,
            nudge_message=message,
            suggested_action=decision.suggested_action,
            trigger_reason=decision.trigger_reason,
        )

    # ---------- internals ----------

    @staticmethod
    def _enrich_context(user_id: str, sessions: list, decision: rules.NudgeDecision) -> dict:
        """
        Best-effort enrichment only — e.g. swapping weak topic_ids for their
        human-readable titles by looking up the learner's roadmap. Never
        blocks the nudge on missing data; falls back to the raw ids/context
        the rule layer already produced if the roadmap isn't found (same
        "degrade, don't fail" pattern as Phase 4's roadmap lookup).
        """
        context = dict(decision.context)
        weak_topic_ids = context.pop("weak_topic_ids", None)
        if weak_topic_ids:
            roadmap = roadmap_store.get(sessions[-1].roadmap_id) if sessions else None
            if roadmap:
                titles_by_id = {t.topic_id: t.title for m in roadmap.milestones for t in m.topics}
                context["struggling_with"] = [titles_by_id.get(tid, tid) for tid in weak_topic_ids]
            else:
                context["struggling_with"] = weak_topic_ids
        return context

    def _generate_message(self, trigger_reason: str, context: dict) -> str:
        messages = [
            {"role": "system", "content": NUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": build_nudge_user_prompt(trigger_reason, context)},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(messages, temperature=0.6, max_tokens=120)
            text = _extract_message(raw_reply)
            if text:
                return text

            print(
                f"[nudges] Failed to parse nudge message for reason "
                f"'{trigger_reason}' (attempt {attempt + 1}). Raw reply:\n{raw_reply}"
            )
            record_event("nudge_message_parse_failure", attempt=attempt + 1, reason=trigger_reason)
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed. Output ONLY a single "
                    "<NUDGE_MESSAGE>...</NUDGE_MESSAGE> block containing just the message text, "
                    "nothing else."
                ),
            })

        record_event("nudge_message_fallback", reason=trigger_reason)
        return FALLBACK_MESSAGES.get(
            trigger_reason, "Just checking in — how's your progress going?"
        )


nudge_engine = NudgeEngine()
