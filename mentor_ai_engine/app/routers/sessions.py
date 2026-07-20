from fastapi import APIRouter
from app.memory.store import memory_store
from app.metrics import record_event
from app.models import SessionLogRequest, SessionLogResponse

router = APIRouter(prefix="/sessions", tags=["Phase 3: Session Tracker"])

# STATUS: LIVE — real mastery tracking (see app/memory/mastery.py + app/memory/store.py).
# No LLM call involved (mechanical time+difficulty-based update), so this
# doesn't depend on MOCK_LLM or an API key at all — it always runs for real.


@router.post("/log", response_model=SessionLogResponse)
def log_session(payload: SessionLogRequest):
    """
    Frontend calls this every time a learner finishes a study session.
    Updates per-topic mastery scores using an exponential-approach model
    (see app/memory/mastery.py: MASTERY_MODEL_VERSION) and returns the
    deltas. Session history is retained in-memory for later phases
    (Phase 6 nudges, Phase 7 weekly review) to read from.
    """
    updated_mastery = memory_store.log_session(
        user_id=payload.user_id,
        roadmap_id=payload.roadmap_id,
        topic_ids_covered=payload.topic_ids_covered,
        duration_minutes=payload.duration_minutes,
        self_rated_difficulty=payload.self_rated_difficulty,
        notes=payload.notes,
    )

    record_event(
        "session_logged",
        user_id=payload.user_id,
        topic_count=len(payload.topic_ids_covered),
        duration_minutes=payload.duration_minutes,
    )

    return SessionLogResponse(logged=True, updated_mastery=updated_mastery)
