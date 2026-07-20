import json
import re

from app.llm_client import llm_client
from app.metrics import record_event
from app.models import QuizQuestion, RoadmapTopic
from app.quiz.prompts import QUIZ_SYSTEM_PROMPT, build_quiz_user_prompt

QUIZ_BLOCK_RE = re.compile(r"<QUIZ>(.*?)</QUIZ>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1  # matching roadmap/interview's tolerance for one bad turn


class QuizGenerationError(Exception):
    """Raised when the LLM fails to produce a parseable, valid quiz after retries.
    Caller (router) decides how to degrade — falls back to mock questions rather
    than surfacing a 500 to the frontend mid-checkpoint."""


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_json_block(raw_reply: str) -> list | None:
    match = QUIZ_BLOCK_RE.search(raw_reply)
    if not match:
        return None
    json_str = _strip_code_fences(match.group(1).strip())
    try:
        data = json.loads(json_str)
        return data if isinstance(data, list) else None
    except (json.JSONDecodeError, TypeError):
        return None


class QuizGenerator:
    def generate(self, topics: list[RoadmapTopic], current_level: str) -> list[QuizQuestion]:
        valid_topic_ids = {t.topic_id for t in topics}
        messages = [
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {"role": "user", "content": build_quiz_user_prompt(current_level, topics)},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(messages, temperature=0.5, max_tokens=1400)
            data = _extract_json_block(raw_reply)
            questions = self._coerce_questions(data, valid_topic_ids)
            if questions:
                return questions

            print(f"[quiz] Failed to parse quiz (attempt {attempt + 1}). Raw reply:\n{raw_reply}")
            record_event("quiz_parse_failure", attempt=attempt + 1)
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed as valid JSON inside a single "
                    "<QUIZ>...</QUIZ> block, or didn't include exactly 4 options with a valid "
                    "correct_index for every topic_id given. Output ONLY that block, valid JSON, "
                    "one question per topic_id, nothing else."
                ),
            })

        raise QuizGenerationError("Could not generate a valid quiz after retries.")

    @staticmethod
    def _coerce_questions(data, valid_topic_ids: set[str]) -> list[QuizQuestion] | None:
        if not data:
            return None
        questions: list[QuizQuestion] = []
        seen_topic_ids: set[str] = set()
        for item in data:
            if not isinstance(item, dict):
                continue
            topic_id = str(item.get("topic_id", "")).strip()
            question_text = str(item.get("question", "")).strip()
            options = item.get("options")
            correct_index = item.get("correct_index")

            if topic_id not in valid_topic_ids or topic_id in seen_topic_ids:
                continue  # skip hallucinated/duplicate topic_id rather than failing the whole quiz
            if not question_text or not isinstance(options, list) or len(options) != 4:
                continue
            if not all(isinstance(o, str) and o.strip() for o in options):
                continue
            try:
                correct_index = int(correct_index)
            except (TypeError, ValueError):
                continue
            if not 0 <= correct_index <= 3:
                continue

            questions.append(QuizQuestion(
                topic_id=topic_id,
                question=question_text,
                options=[o.strip() for o in options],
                correct_index=correct_index,
            ))
            seen_topic_ids.add(topic_id)

        # Require at least one valid question to consider this a usable quiz —
        # partial coverage (some topics missing a question) is tolerated rather
        # than retried, since one bad topic_id shouldn't block the whole quiz.
        return questions or None


quiz_generator = QuizGenerator()
