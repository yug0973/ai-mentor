from fastapi import APIRouter
from app.config import settings
from app.metrics import record_event
from app.models import GenerateLessonRequest, GenerateLessonResponse
from app.mock_data import mock_lesson_content
from app.study.generator import lesson_generator, LessonGenerationError

router = APIRouter(prefix="/lesson", tags=["Topic Lesson Content"])

# STATUS: LIVE — real single-call LLM generation (see app/study/generator.py).
# Previously the frontend faked this entirely client-side: fixed generic
# paragraphs, a hardcoded fake JS "sandbox" code block shown for every
# topic regardless of subject, and 3 hardcoded quiz questions. This
# replaces all of that with real, domain-aware content that only includes
# a code example when the topic is actually about code.


@router.post("/generate", response_model=GenerateLessonResponse)
def generate_lesson(payload: GenerateLessonRequest):
    """
    Real mode: single LLM call producing explanation paragraphs, an
    optional code example (only if genuinely relevant to the topic), and
    3 topic-specific practice questions.

    Mock mode (MOCK_LLM=true) or on parse failure after retries: falls
    back to mock_lesson_content, same "log and don't crash" pattern used
    elsewhere — records a metric event either way so fallback rate is
    visible via GET /metrics.
    """
    if settings.MOCK_LLM:
        record_event("lesson_generated", mode="mock_llm_setting", topic_id=payload.topic.topic_id)
        return GenerateLessonResponse(lesson=mock_lesson_content(payload.topic))

    try:
        lesson = lesson_generator.generate(payload.topic, payload.domain, payload.current_level)
        record_event(
            "lesson_generated", mode="real", topic_id=payload.topic.topic_id,
            has_code_example=lesson.has_code_example,
        )
        return GenerateLessonResponse(lesson=lesson)
    except LessonGenerationError as e:
        print(f"[lesson] Real generation failed, falling back to mock: {e}")
        record_event("lesson_generation_fallback", topic_id=payload.topic.topic_id, reason=str(e))
        return GenerateLessonResponse(lesson=mock_lesson_content(payload.topic))
