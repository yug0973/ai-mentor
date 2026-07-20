from fastapi import APIRouter
from app.config import settings
from app.metrics import record_event
from app.models import WeeklyReviewResponse
from app.mock_data import mock_weekly_review
from app.reviews.engine import weekly_review_engine

router = APIRouter(prefix="/reviews", tags=["Phase 7: Weekly Review Generator"])

# STATUS: LIVE — deterministic aggregation (app/reviews/rules.py: sessions
# completed, hours studied, topics improved/stagnant via mastery-delta replay,
# goal progress) over Phase 3's session/mastery data, + a targeted LLM call
# (app/reviews/engine.py) that only writes the next_week_focus and
# motivational_insight *text* from those already-computed facts. MOCK_LLM=true
# still returns the original fixed mock review so other teams can keep
# developing offline without a key, per API_CONTRACT.md constraint #4.
# Endpoint path and schema are unchanged from the stub.


@router.post("/weekly/{user_id}", response_model=WeeklyReviewResponse)
def generate_weekly_review(user_id: str):
    """
    Backend's scheduled weekly job calls this per user.

    Real mode: aggregates the user's Phase 3 session history over the
    trailing 7 days into sessions_completed / total_hours, reconstructs each
    touched topic's mastery delta across the week to sort it into
    topics_improved vs. topics_stagnant, pulls goal_progress_percent from
    this service's roadmap copy if available, and picks one focus_topic for
    next week (preferring a stagnant topic over an untouched one). A
    targeted LLM call then phrases next_week_focus and motivational_insight
    from those facts (see app/reviews/engine.py). A user with zero session
    history ever gets a fully deterministic "get started" response with no
    LLM call at all.
    """
    if settings.MOCK_LLM:
        record_event("weekly_review_generated", mode="mock_llm_setting", user_id=user_id)
        return mock_weekly_review(user_id)

    return weekly_review_engine.generate(user_id=user_id)
