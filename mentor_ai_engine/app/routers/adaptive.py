from fastapi import APIRouter
from app.config import settings
from app.metrics import record_event
from app.models import QuizResult, AdaptRoadmapResponse
from app.mock_data import mock_adapt_response
from app.roadmap.store import roadmap_store
from app.adaptive.engine import adaptive_engine, AdaptiveEngineError

router = APIRouter(prefix="/roadmap", tags=["Phase 4: Adaptive Roadmap Engine"])

# STATUS: LIVE — rule-based weak-topic detection (app/adaptive/rules.py) +
# targeted LLM rewrite of just the affected milestone's remediation topics
# (app/adaptive/engine.py). MOCK_LLM=true still returns fixed mock data so
# other teams can keep developing offline without a key, per
# API_CONTRACT.md constraint #4. Endpoint path and schema are unchanged
# from the stub.


@router.post("/adapt", response_model=AdaptRoadmapResponse)
def adapt_roadmap(payload: QuizResult):
    """
    Backend calls this after a learner submits a checkpoint quiz.

    Real mode: looks up the roadmap in app/roadmap/store.py (populated by
    /roadmap/generate), reads current Phase 3 mastery scores for the
    learner, and decides per-topic whether to insert a remediation topic
    (weak topic detection combines quiz score + mastery — see
    app/adaptive/rules.py), whether to mark the milestone's topics
    completed (quiz passed), and whether that unlocks anything downstream.
    Remediation topic *content* comes from one targeted LLM call scoped to
    just the flagged topics — not a full roadmap regeneration.

    Falls back to mock output (not a 500) if: MOCK_LLM=true, the
    roadmap_id isn't in this service's in-memory store (different process,
    restart, or a roadmap this service never generated), or the
    milestone_id doesn't exist on that roadmap. Every path records a
    metric event (see app/metrics.py, GET /metrics).
    """
    if settings.MOCK_LLM:
        record_event(
            "adaptive_adapted", mode="mock_llm_setting",
            user_id=payload.user_id, roadmap_id=payload.roadmap_id,
        )
        return mock_adapt_response(
            roadmap_id=payload.roadmap_id, user_id=payload.user_id, goal="mock-goal-placeholder",
        )

    roadmap = roadmap_store.get(payload.roadmap_id)
    if roadmap is None:
        # Not found in this process's in-memory store — see
        # app/roadmap/store.py for why that can happen. Degrade to mock
        # rather than 404ing on backend's quiz-submission flow.
        print(f"[adaptive] roadmap_id {payload.roadmap_id!r} not found in store, falling back to mock")
        record_event(
            "adaptive_roadmap_not_found", user_id=payload.user_id, roadmap_id=payload.roadmap_id,
        )
        return mock_adapt_response(
            roadmap_id=payload.roadmap_id, user_id=payload.user_id, goal="mock-goal-placeholder",
        )

    try:
        response = adaptive_engine.adapt(roadmap=roadmap, quiz_result=payload)
        # adaptive_engine.adapt() mutates the roadmap in place; re-save so
        # the store reflects the change for any future /adapt or debug
        # GET /roadmap/{roadmap_id} call.
        roadmap_store.save(response.updated_roadmap)
        record_event(
            "adaptive_adapted", mode="real", user_id=payload.user_id,
            roadmap_id=payload.roadmap_id, changed=response.changed,
        )
        return response
    except AdaptiveEngineError as e:
        # e.g. unknown milestone_id for this roadmap — degrade to mock
        # rather than 500ing, matching Phase 2's "log and don't crash" approach.
        print(f"[adaptive] Real adaptation failed, falling back to mock: {e}")
        record_event(
            "adaptive_adaptation_fallback", user_id=payload.user_id,
            roadmap_id=payload.roadmap_id, reason=str(e),
        )
        return mock_adapt_response(
            roadmap_id=payload.roadmap_id, user_id=payload.user_id, goal=roadmap.goal,
        )
