"""
Eval harness for Phase 8 (Feedback Loop). Aggregates logged feedback events
(app/feedback/store.py) into the ratios that actually matter for judging
whether Phase 6's nudges and Phase 4's adaptive roadmap changes are helping:
how often a shown nudge gets followed vs. ignored, and how often an
adaptive roadmap change sticks vs. gets reverted.

Deliberately NOT part of the frozen API_CONTRACT — same "internal ops
visibility" carve-out as GET /metrics in app/main.py. This is a debug/
analytics view over Phase 8's own data, not a schema other teams build
against.

Known limitation, flagged rather than silently worked around: the frozen
FeedbackEventRequest schema (API_CONTRACT.md) carries only a reference_id,
not the trigger_reason (Phase 6) or change type (Phase 4) that produced the
nudge/roadmap change it refers to. So this harness reports overall
follow-through and acceptance rates, but can't yet break them down by
"which nudge reason performs best" or "which prompt version" without a
schema change on the frontend/backend side that generates reference_id —
flagging this now rather than guessing at a join that isn't there.
"""
from collections import Counter

from app.feedback.store import FeedbackEvent

NUDGE_SHOWN = "nudge_shown"
NUDGE_FOLLOWED = "nudge_followed"
NUDGE_IGNORED = "nudge_ignored"
ROADMAP_ACCEPTED = "roadmap_change_accepted"
ROADMAP_REVERTED = "roadmap_change_reverted"


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    """None (not 0.0) when there's no data yet — a 0% rate and "no data"
    are different facts and callers shouldn't confuse them."""
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)


def summarize(events: list[FeedbackEvent]) -> dict:
    counts = Counter(e.event_type for e in events)

    nudge_followed = counts.get(NUDGE_FOLLOWED, 0)
    nudge_ignored = counts.get(NUDGE_IGNORED, 0)
    roadmap_accepted = counts.get(ROADMAP_ACCEPTED, 0)
    roadmap_reverted = counts.get(ROADMAP_REVERTED, 0)

    return {
        "total_events": len(events),
        "event_counts": dict(counts),
        "nudge_follow_through_rate": _safe_ratio(nudge_followed, nudge_followed + nudge_ignored),
        "roadmap_change_acceptance_rate": _safe_ratio(roadmap_accepted, roadmap_accepted + roadmap_reverted),
        "distinct_users": len({e.user_id for e in events}),
    }
