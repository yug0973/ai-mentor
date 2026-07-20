from fastapi import APIRouter
from app.config import settings
from app.metrics import record_event
from app.models import GenerateQuizRequest, GenerateQuizResponse
from app.mock_data import mock_quiz_questions
from app.quiz.generator import quiz_generator, QuizGenerationError

router = APIRouter(prefix="/quiz", tags=["Checkpoint Quiz"])

# STATUS: LIVE — real single-call LLM generation (see app/quiz/generator.py).
# Previously the frontend faked this entirely client-side with one hardcoded
# generic question reused for every topic — this replaces that with a real,
# topic-specific question per topic, generated the same way roadmap topics are.


@router.post("/generate", response_model=GenerateQuizResponse)
def generate_quiz(payload: GenerateQuizRequest):
    """
    Takes the topics from one milestone and returns one real, topic-specific
    multiple-choice question per topic.

    Real mode: single batched LLM call covering all topics in the milestone
    at once (see app/quiz/generator.py).

    Mock mode (MOCK_LLM=true) or on parse failure after retries: falls back
    to mock_quiz_questions, same "log and don't crash" pattern as roadmap
    generation — records a metric event either way so fallback rate is
    visible via GET /metrics.
    """
    if settings.MOCK_LLM:
        record_event("quiz_generated", mode="mock_llm_setting", milestone_id=payload.milestone_id)
        return GenerateQuizResponse(questions=mock_quiz_questions(payload.topics))

    try:
        questions = quiz_generator.generate(payload.topics, payload.current_level)
        record_event(
            "quiz_generated", mode="real", milestone_id=payload.milestone_id,
            question_count=len(questions),
        )
        return GenerateQuizResponse(questions=questions)
    except QuizGenerationError as e:
        print(f"[quiz] Real generation failed, falling back to mock: {e}")
        record_event("quiz_generation_fallback", milestone_id=payload.milestone_id, reason=str(e))
        return GenerateQuizResponse(questions=mock_quiz_questions(payload.topics))
