"""
Deterministic decision layer for Phase 6 (Motivation Detector / Nudges).
Same split as Phase 4 (app/adaptive/rules.py): WHETHER to nudge and WHY is
entirely rule-based given Phase 3's session/mastery data
(app/memory/store.py) — no LLM needed to make that call. Only the nudge's
message *text* is LLM-authored (app/nudges/prompts.py, app/nudges/engine.py),
scoped to whichever reason the rules picked.

Versioned like the other phases' rule modules so thresholds can be tuned
later without losing track of what produced a given nudge decision.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone

NUDGE_MODEL_VERSION = "nudges_v1"

# Days since the learner's last logged session before a nudge is warranted.
# Two tiers: a gentle check-in first, escalating to a more direct one if
# the gap grows — different trigger_reason/suggested_action so the message
# LLM call (and any downstream nudge-frequency capping backend wants to do)
# can tell them apart.
INACTIVITY_DAYS_THRESHOLD = 3
LONG_INACTIVITY_DAYS_THRESHOLD = 7

# Session-frequency drop: compares session count in the trailing window vs
# the window before it. Guarded by a minimum previous-window count so one
# person's naturally light week-1 doesn't read as a "drop" from near-zero.
FREQUENCY_WINDOW_DAYS = 7
FREQUENCY_DROP_RATIO = 0.5  # current window count must fall to <= this fraction of the previous window
FREQUENCY_DROP_MIN_PREVIOUS_SESSIONS = 2

# "Struggling" signal: looks at the learner's most recent sessions for
# self-rated difficulty, and at Phase 3 mastery scores for whatever topics
# those sessions covered.
STRUGGLE_LOOKBACK_SESSIONS = 3
STRUGGLE_HARD_RATIO_THRESHOLD = 0.6  # fraction of lookback sessions rated "hard"
STRUGGLE_MASTERY_THRESHOLD = 0.35  # avg mastery across recently-covered topics


@dataclass
class NudgeDecision:
    triggered: bool
    trigger_reason: str | None = None
    suggested_action: str | None = None
    context: dict = field(default_factory=dict)


def _days_since(dt: datetime, now: datetime) -> float:
    return (now - dt).total_seconds() / 86400.0


def _sessions_in_window(sessions: list, now: datetime, start_days_ago: float, end_days_ago: float) -> list:
    """Sessions logged between `start_days_ago` and `end_days_ago` days before `now`."""
    return [
        s for s in sessions
        if end_days_ago <= _days_since(s.logged_at, now) < start_days_ago
    ]


def _detect_frequency_drop(sessions: list, now: datetime) -> bool:
    current_window = _sessions_in_window(sessions, now, FREQUENCY_WINDOW_DAYS, 0)
    previous_window = _sessions_in_window(sessions, now, FREQUENCY_WINDOW_DAYS * 2, FREQUENCY_WINDOW_DAYS)
    if len(previous_window) < FREQUENCY_DROP_MIN_PREVIOUS_SESSIONS:
        return False
    return len(current_window) <= len(previous_window) * FREQUENCY_DROP_RATIO


def _detect_struggle(sessions: list, mastery_map: dict[str, float]) -> tuple[bool, list[str]]:
    """Returns (is_struggling, weak_topic_ids) using the most recent sessions."""
    recent = sessions[-STRUGGLE_LOOKBACK_SESSIONS:]
    if not recent:
        return False, []

    hard_count = sum(1 for s in recent if s.self_rated_difficulty == "hard")
    hard_ratio = hard_count / len(recent)

    covered_topic_ids = {tid for s in recent for tid in s.topic_ids_covered}
    if covered_topic_ids:
        scores = [mastery_map.get(tid, 0.5) for tid in covered_topic_ids]
        avg_mastery = sum(scores) / len(scores)
        weak_topic_ids = sorted(
            (tid for tid in covered_topic_ids if mastery_map.get(tid, 0.5) < STRUGGLE_MASTERY_THRESHOLD),
            key=lambda tid: mastery_map.get(tid, 0.5),
        )
    else:
        avg_mastery = 1.0
        weak_topic_ids = []

    is_struggling = hard_ratio >= STRUGGLE_HARD_RATIO_THRESHOLD or avg_mastery < STRUGGLE_MASTERY_THRESHOLD
    return is_struggling, weak_topic_ids


def detect_nudge(sessions: list, mastery_map: dict[str, float], now: datetime | None = None) -> NudgeDecision:
    """
    sessions: chronologically-ordered list of app.memory.store.SessionRecord
    for one user (as returned by MemoryStore.get_sessions).
    mastery_map: topic_id -> mastery_score for the same user.

    Priority when multiple signals fire, most urgent first: long inactivity,
    short inactivity, struggling, frequency drop. Only one reason is
    returned per check — the router calls this once per request, so there's
    no ordering issue between checks.
    """
    now = now or datetime.now(timezone.utc)

    if not sessions:
        # Can't detect a *drop* in motivation with no session history at
        # all — there's nothing to compare against yet.
        return NudgeDecision(triggered=False, trigger_reason="no_session_history")

    last_session = sessions[-1]
    days_inactive = _days_since(last_session.logged_at, now)

    if days_inactive >= LONG_INACTIVITY_DAYS_THRESHOLD:
        return NudgeDecision(
            triggered=True,
            trigger_reason="long_inactivity",
            suggested_action="check_in",
            context={"days_inactive": round(days_inactive, 1)},
        )

    if days_inactive >= INACTIVITY_DAYS_THRESHOLD:
        return NudgeDecision(
            triggered=True,
            trigger_reason="inactivity",
            suggested_action="offer_lighter_session",
            context={"days_inactive": round(days_inactive, 1)},
        )

    is_struggling, weak_topic_ids = _detect_struggle(sessions, mastery_map)
    if is_struggling:
        return NudgeDecision(
            triggered=True,
            trigger_reason="struggling",
            suggested_action="offer_lighter_session",
            context={"weak_topic_ids": weak_topic_ids},
        )

    if _detect_frequency_drop(sessions, now):
        return NudgeDecision(
            triggered=True,
            trigger_reason="frequency_drop",
            suggested_action="check_in",
            context={},
        )

    return NudgeDecision(triggered=False, trigger_reason="on_track")
