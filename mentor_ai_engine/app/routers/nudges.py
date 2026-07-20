from fastapi import APIRouter
from app.config import settings
from app.metrics import record_event
from app.models import NudgeCheckResponse
from app.mock_data import mock_nudge_check
from app.nudges.engine import nudge_engine

router = APIRouter(prefix="/nudges", tags=["Phase 6: Motivation Detector / Nudges"])

# STATUS: LIVE — rule-based signal detection (app/nudges/rules.py: inactivity,
# session-frequency drop, struggling on recent topics) reading Phase 3's
# session/mastery data, + a targeted LLM call (app/nudges/engine.py) that
# only writes the nudge_message text for whichever reason the rules picked.
# The LLM is only called when a nudge actually fires. MOCK_LLM=true still
# returns the original fixed mock nudge so other teams can keep developing
# offline without a key, per API_CONTRACT.md constraint #4. Endpoint path
# and schema are unchanged from the stub.


@router.get("/check/{user_id}", response_model=NudgeCheckResponse)
def check_nudge(user_id: str):
    """
    Backend's scheduled job (e.g. daily cron) calls this per user to check
    whether a motivational nudge should be sent.

    Real mode: reads the user's Phase 3 session history and mastery scores
    and applies deterministic rules for inactivity (two severity tiers),
    a drop in session frequency week-over-week, and struggling on recently
    covered topics (self-rated difficulty + mastery scores). If more than
    one signal fires, the most urgent one wins (see
    app/nudges/rules.py::detect_nudge). A user with no session history at
    all gets nudge_triggered=False (there's no history to detect a *drop*
    against yet), same as a user who's currently on track.
    """
    if settings.MOCK_LLM:
        record_event("nudge_checked", mode="mock_llm_setting", user_id=user_id)
        return mock_nudge_check()

    return nudge_engine.check(user_id=user_id)
