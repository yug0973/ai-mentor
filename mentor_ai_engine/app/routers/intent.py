from fastapi import APIRouter
from app.config import settings
from app.metrics import record_event
from app.models import ClassifyIntentRequest, ClassifyIntentResponse
from app.mock_data import mock_intent_classification
from app.intent.classifier import intent_classifier

router = APIRouter(prefix="/intent", tags=["Phase 5: Intent Parser"])

# STATUS: LIVE — fast-path rules (app/intent/rules.py) for trivial cases
# (empty message, bare quiz-option reply) + a small/fast-tier LLM call
# (app/intent/classifier.py, settings.INTENT_LLM_MODEL) for everything else,
# with a deterministic keyword fallback if the LLM never returns parseable
# output. MOCK_LLM=true still returns the original naive mock classification
# so other teams can keep developing offline without a key, per
# API_CONTRACT.md constraint #4. Endpoint path and schema are unchanged.


@router.post("/classify", response_model=ClassifyIntentResponse)
def classify_intent(payload: ClassifyIntentRequest):
    """
    Called on every learner message during ongoing (post-onboarding)
    conversation, to route it to the right downstream handler (e.g.
    surfacing frustration to a nudge, or routing a quiz-style reply into
    the Phase 4 adaptive pipeline instead of general chat).

    Real mode: cheap deterministic shortcuts first (empty message, bare
    quiz-option reply), otherwise one fast-tier LLM call. Falls back to a
    low-confidence keyword guess (not a 500) if the LLM never returns
    parseable output after one retry. Every path records a metric event
    (see app/metrics.py, GET /metrics).
    """
    if settings.MOCK_LLM:
        record_event("intent_classified", mode="mock_llm_setting", user_id=payload.user_id)
        return mock_intent_classification(payload.message)

    return intent_classifier.classify(user_id=payload.user_id, message=payload.message)
