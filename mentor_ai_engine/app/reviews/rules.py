"""
Deterministic aggregation layer for Phase 7 (Weekly Review Generator).
Same split as Phases 4 and 6: every *number* and *fact* in the review
(sessions_completed, total_hours, topics_improved/stagnant, goal_progress,
which topic to focus on next) is computed here with zero LLM involvement.
Only the two free-text fields (next_week_focus phrasing, motivational_insight)
are LLM-authored, in app/reviews/engine.py — this module just hands them the
facts to write copy about.

Versioned like the other phases' rule modules so thresholds can be tuned
later without losing track of what produced a given review.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

REVIEW_MODEL_VERSION = "reviews_v1"

REVIEW_WINDOW_DAYS = 7

# A topic touched this week counts as "improved" only if its mastery score
# moved by at least this much across the week's sessions — otherwise it's
# "stagnant" (time was spent, but the needle barely moved, e.g. a run of
# "hard"-rated sessions or a topic that's already near the mastery ceiling).
# Mirrors app/memory/mastery.py's diminishing-returns curve: a single
# reference-length "medium" session closes ~15% of the remaining gap, so
# 0.03 is a deliberately low bar — it should catch nearly any real session,
# and only flag as stagnant the sessions that truly didn't move the score.
IMPROVEMENT_THRESHOLD = 0.03


@dataclass
class WeeklyReviewData:
    week_start: str
    week_end: str
    sessions_completed: int
    total_hours: float
    topics_improved: list[str]  # topic_ids
    topics_stagnant: list[str]  # topic_ids
    goal_progress_percent: float
    focus_topic_id: str | None
    roadmap_id: str | None
    has_any_history: bool
    context: dict = field(default_factory=dict)


def _replay_mastery(sorted_sessions: list, week_start_dt: datetime) -> tuple[dict[str, float], dict[str, float]]:
    """
    Replays a user's full session history in chronological order using the
    exact same update formula as app/memory/store.py / app/memory/mastery.py,
    to recover each topic's mastery score *at the moment the review window
    began* (mastery_map only exposes the CURRENT score, not a point-in-time
    snapshot, so this reconstructs it rather than requiring MemoryStore to
    store extra history).

    Returns (mastery_before_window, mastery_final) — both topic_id -> score.
    """
    from app.memory.mastery import update_mastery_score  # local import avoids a cycle at module load

    running: dict[str, float] = {}
    before_window: dict[str, float] = {}

    for s in sorted_sessions:
        in_window = s.logged_at >= week_start_dt
        if in_window:
            for topic_id in s.topic_ids_covered:
                if topic_id not in before_window:
                    before_window[topic_id] = running.get(topic_id, 0.0)

        if not s.topic_ids_covered:
            continue
        exposure_minutes = s.duration_minutes / len(s.topic_ids_covered)
        for topic_id in s.topic_ids_covered:
            current = running.get(topic_id, 0.0)
            running[topic_id] = update_mastery_score(
                current_score=current,
                exposure_minutes=exposure_minutes,
                self_rated_difficulty=s.self_rated_difficulty,
            )

    return before_window, running


def _pick_focus_topic(
    topics_stagnant: list[str],
    topics_touched: set[str],
    mastery_final: dict[str, float],
) -> str | None:
    """
    Prefer a topic that got attention this week but didn't move (most
    actionable — "you spent time here, let's close it out"). Falls back to
    the lowest-mastery topic touched this week if nothing was flagged
    stagnant. Returns None if no topic was touched at all.
    """
    candidates = topics_stagnant or list(topics_touched)
    if not candidates:
        return None
    return min(candidates, key=lambda tid: mastery_final.get(tid, 0.0))


def compute_weekly_data(
    sessions: list,
    mastery_map: dict[str, float],
    roadmap,  # app.models.Roadmap | None
    now: datetime | None = None,
) -> WeeklyReviewData:
    """
    sessions: chronologically-unordered list of app.memory.store.SessionRecord
    for one user (as returned by MemoryStore.get_sessions) — sorted here by
    logged_at rather than trusted to already be in order, since tests (and
    any future backdating/import tooling) may mutate timestamps after
    insertion.
    mastery_map: topic_id -> CURRENT mastery_score for the same user (used
    only as a display fallback; the window-relative deltas below are
    reconstructed from the session history itself).
    roadmap: the user's roadmap if this service has one on file (see
    app/roadmap/store.py), else None — used only for goal_progress_percent.
    """
    now = now or datetime.now(timezone.utc)
    today = now.date()
    week_start_date = today - timedelta(days=REVIEW_WINDOW_DAYS)

    if not sessions:
        return WeeklyReviewData(
            week_start=week_start_date.isoformat(),
            week_end=today.isoformat(),
            sessions_completed=0,
            total_hours=0.0,
            topics_improved=[],
            topics_stagnant=[],
            goal_progress_percent=0.0,
            focus_topic_id=None,
            roadmap_id=None,
            has_any_history=False,
        )

    sorted_sessions = sorted(sessions, key=lambda s: s.logged_at)
    week_start_dt = now - timedelta(days=REVIEW_WINDOW_DAYS)
    sessions_in_week = [s for s in sorted_sessions if s.logged_at >= week_start_dt]

    sessions_completed = len(sessions_in_week)
    total_hours = round(sum(s.duration_minutes for s in sessions_in_week) / 60.0, 2)

    mastery_before, mastery_final = _replay_mastery(sorted_sessions, week_start_dt)
    topics_touched = {tid for s in sessions_in_week for tid in s.topic_ids_covered}

    topics_improved: list[str] = []
    topics_stagnant: list[str] = []
    for topic_id in sorted(topics_touched):
        delta = mastery_final.get(topic_id, 0.0) - mastery_before.get(topic_id, 0.0)
        if delta >= IMPROVEMENT_THRESHOLD:
            topics_improved.append(topic_id)
        else:
            topics_stagnant.append(topic_id)

    roadmap_id = sorted_sessions[-1].roadmap_id
    goal_progress_percent = roadmap.progress_percent if roadmap else 0.0

    focus_topic_id = _pick_focus_topic(topics_stagnant, topics_touched, mastery_final)

    return WeeklyReviewData(
        week_start=week_start_date.isoformat(),
        week_end=today.isoformat(),
        sessions_completed=sessions_completed,
        total_hours=total_hours,
        topics_improved=topics_improved,
        topics_stagnant=topics_stagnant,
        goal_progress_percent=goal_progress_percent,
        focus_topic_id=focus_topic_id,
        roadmap_id=roadmap_id,
        has_any_history=True,
    )
