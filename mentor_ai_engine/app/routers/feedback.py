from fastapi import APIRouter, Query
from app.metrics import record_event
from app.models import FeedbackEventRequest, FeedbackEventResponse
from app.feedback.store import feedback_store
from app.feedback.eval import summarize

router = APIRouter(prefix="/feedback", tags=["Phase 8: Feedback Loop"])

# STATUS: LIVE — POST /feedback/event's path/schema are unchanged from the
# original functional stub (frozen per API_CONTRACT.md), now backed by real
# in-memory storage (app/feedback/store.py) instead of a print statement.
# GET /feedback/summary is a NEW endpoint, NOT part of the frozen
# API_CONTRACT — same internal-ops carve-out as GET /metrics in app/main.py —
# exposing the Phase 8 eval harness aggregation (app/feedback/eval.py) over
# stored events.


@router.post("/event", response_model=FeedbackEventResponse)
def log_feedback_event(payload: FeedbackEventRequest):
    """
    Call this whenever a learner interacts with a nudge or roadmap change
    (shown/followed/ignored/accepted/reverted). Persisted in-memory
    (app/feedback/store.py) and feeds GET /feedback/summary's eval-harness
    aggregation.
    """
    feedback_store.log(
        user_id=payload.user_id,
        event_type=payload.event_type,
        reference_id=payload.reference_id,
        outcome_note=payload.outcome_note,
    )
    record_event("feedback_logged", event_type=payload.event_type, user_id=payload.user_id)
    return FeedbackEventResponse(logged=True)


@router.get("/summary")
def feedback_summary(user_id: str | None = Query(default=None)):
    """
    Debug/ops endpoint, NOT part of the frozen phase API_CONTRACT (same
    carve-out as GET /metrics) — the Phase 8 eval harness view over logged
    feedback: nudge follow-through rate (nudge_followed vs. nudge_ignored),
    roadmap change acceptance rate (accepted vs. reverted), and raw event
    counts. Pass ?user_id= to scope to one learner instead of the whole
    in-memory store. Rates are `null` (not 0.0) when there's no data yet for
    that ratio, so "no data" and "0% rate" aren't confused.

    NOTE: this can't yet break rates down by nudge trigger_reason or
    adaptive change type — the frozen FeedbackEventRequest schema only
    carries a reference_id, not that context. See app/feedback/eval.py for
    the full caveat; a schema addition would be a breaking change to flag,
    not something to silently work around here.
    """
    events = feedback_store.for_user(user_id) if user_id else feedback_store.all()
    return summarize(events)
