from fastapi import APIRouter, HTTPException
from app.config import settings
from app.metrics import record_event
from app.models import GenerateRoadmapRequest, Roadmap
from app.mock_data import mock_roadmap
from app.roadmap.generator import roadmap_generator, RoadmapGenerationError
from app.roadmap.store import roadmap_store

router = APIRouter(prefix="/roadmap", tags=["Phase 2: Roadmap Generator"])

# STATUS: LIVE — real two-pass LLM generation (see app/roadmap/generator.py).
# MOCK_LLM=true still returns fixed mock data so other teams can keep
# developing offline without a key, per API_CONTRACT.md constraint #4.
# Endpoint path and schema are unchanged from the stub.


@router.post("/generate", response_model=Roadmap)
def generate_roadmap(payload: GenerateRoadmapRequest):
    """
    Takes a completed LearnerProfile (output of Phase 1) and returns a
    milestone/topic roadmap (DAG).

    Real mode: two-pass generation — coarse milestones, then per-milestone
    topic expansion with prerequisite tracking (see app/roadmap/generator.py).

    Mock mode (MOCK_LLM=true): fixed mock data, same as the original stub.

    Every path records a metric event (see app/metrics.py, GET /metrics) so
    fallback-to-mock rate is visible without needing external monitoring —
    if real generation starts failing more than expected (e.g. Groq free
    tier flakiness), `roadmap_generation_fallback` will show it.

    Every path also saves the returned roadmap into app/roadmap/store.py —
    Phase 4 (`/roadmap/adapt`) looks roadmaps up by `roadmap_id` from there,
    since QuizResult only carries the id, not the roadmap itself (backend
    owns long-term persistence; this is just this service's working copy).
    """
    if settings.MOCK_LLM:
        record_event("roadmap_generated", mode="mock_llm_setting", user_id=payload.user_id)
        roadmap = mock_roadmap(user_id=payload.user_id, goal=payload.learner_profile.goal)
        roadmap_store.save(roadmap)
        return roadmap

    try:
        roadmap = roadmap_generator.generate(user_id=payload.user_id, profile=payload.learner_profile)
        record_event(
            "roadmap_generated", mode="real", user_id=payload.user_id,
            milestone_count=len(roadmap.milestones),
        )
        roadmap_store.save(roadmap)
        return roadmap
    except RoadmapGenerationError as e:
        # Real generation failed after retries (bad/unparseable LLM output,
        # provider error, etc.) — degrade to mock rather than 500ing on
        # whoever's calling this, matching Phase 1's "log and don't crash" approach.
        print(f"[roadmap] Real generation failed, falling back to mock: {e}")
        record_event("roadmap_generation_fallback", user_id=payload.user_id, reason=str(e))
        roadmap = mock_roadmap(user_id=payload.user_id, goal=payload.learner_profile.goal)
        roadmap_store.save(roadmap)
        return roadmap


@router.get("/{roadmap_id}", response_model=Roadmap)
def get_roadmap(roadmap_id: str):
    """
    Debug/ops endpoint — NOT part of the frozen phase API_CONTRACT, same
    status as GET /metrics. Lets you inspect this service's in-memory copy
    of a roadmap (e.g. to see what Phase 4 changed after an /adapt call)
    without needing backend's persistence layer in the loop.
    """
    roadmap = roadmap_store.get(roadmap_id)
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found in this service's in-memory store")
    return roadmap
