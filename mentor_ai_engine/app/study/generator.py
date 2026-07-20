import json
import re

from app.llm_client import llm_client
from app.metrics import record_event
from app.models import LessonCodeExample, LessonContent, LessonPracticeQuestion, RoadmapTopic
from app.study.prompts import LESSON_SYSTEM_PROMPT, build_lesson_user_prompt

LESSON_BLOCK_RE = re.compile(r"<LESSON>(.*?)</LESSON>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1


class LessonGenerationError(Exception):
    """Raised when the LLM fails to produce a parseable, valid lesson after retries.
    Caller (router) falls back to mock content rather than surfacing a 500."""


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_json_block(raw_reply: str) -> dict | None:
    match = LESSON_BLOCK_RE.search(raw_reply)
    if not match:
        return None
    json_str = _strip_code_fences(match.group(1).strip())
    try:
        data = json.loads(json_str)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


class LessonGenerator:
    def generate(self, topic: RoadmapTopic, domain: str, current_level: str) -> LessonContent:
        messages = [
            {"role": "system", "content": LESSON_SYSTEM_PROMPT},
            {"role": "user", "content": build_lesson_user_prompt(topic, domain, current_level)},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(messages, temperature=0.6, max_tokens=1600)
            data = _extract_json_block(raw_reply)
            lesson = self._coerce_lesson(data)
            if lesson:
                return lesson

            print(f"[lesson] Failed to parse lesson (attempt {attempt + 1}). Raw reply:\n{raw_reply}")
            record_event("lesson_parse_failure", attempt=attempt + 1)
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed as valid JSON inside a single "
                    "<LESSON>...</LESSON> block, or was missing required fields (explanation, "
                    "has_code_example, code_example, exactly 3 practice_questions each with 4 "
                    "options and a valid correct_index). Output ONLY that block, valid JSON, "
                    "nothing else."
                ),
            })

        raise LessonGenerationError("Could not generate a valid lesson after retries.")

    @staticmethod
    def _coerce_lesson(data) -> LessonContent | None:
        if not data:
            return None
        try:
            explanation = data.get("explanation")
            if not isinstance(explanation, list) or not explanation:
                return None
            explanation = [str(p).strip() for p in explanation if str(p).strip()]
            if not explanation:
                return None

            has_code_example = bool(data.get("has_code_example"))

            code_example = None
            if has_code_example:
                raw_code = data.get("code_example")
                if not isinstance(raw_code, dict):
                    return None  # claimed code but didn't provide it — invalid, retry
                language = str(raw_code.get("language", "")).strip()
                code = str(raw_code.get("code", "")).strip()
                if not language or not code:
                    return None
                code_example = LessonCodeExample(language=language, code=code)
            # if has_code_example is False, code_example stays None regardless
            # of whatever the model put there — enforced server-side, not trusted

            raw_questions = data.get("practice_questions")
            if not isinstance(raw_questions, list) or len(raw_questions) != 3:
                return None

            questions: list[LessonPracticeQuestion] = []
            for item in raw_questions:
                if not isinstance(item, dict):
                    return None
                question_text = str(item.get("question", "")).strip()
                options = item.get("options")
                correct_index = item.get("correct_index")
                hint = str(item.get("hint", "")).strip()

                if not question_text or not hint:
                    return None
                if not isinstance(options, list) or len(options) != 4:
                    return None
                if not all(isinstance(o, str) and o.strip() for o in options):
                    return None
                try:
                    correct_index = int(correct_index)
                except (TypeError, ValueError):
                    return None
                if not 0 <= correct_index <= 3:
                    return None

                questions.append(LessonPracticeQuestion(
                    question=question_text,
                    options=[o.strip() for o in options],
                    correct_index=correct_index,
                    hint=hint,
                ))

            return LessonContent(
                explanation=explanation,
                has_code_example=has_code_example,
                code_example=code_example,
                practice_questions=questions,
            )
        except (TypeError, ValueError, AttributeError):
            return None


lesson_generator = LessonGenerator()
