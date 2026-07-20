"""
Phase 5: Intent Parser.

Classifies a learner's free-text message into one of six routing intents
(see app/models.py ClassifyIntentResponse). Three layers, cheapest first:

1. Fast path (app/intent/rules.py) — zero-latency shortcuts for an empty
   message or a bare quiz-option reply. No LLM call.
2. Real classification — one small/fast LLM call (settings.INTENT_LLM_MODEL,
   deliberately a smaller model than the one used for interview/roadmap/
   adaptive generation, since this fires on every learner message) that
   returns a single JSON object in a <INTENT_RESULT>...</INTENT_RESULT> tag.
3. Deterministic keyword fallback (app/intent/rules.py) if the LLM never
   returns parseable output after one retry — same "the router must not
   drop the message" principle as Phase 4's remediation fallback, just
   applied to routing instead of roadmap content.
"""
import json
import re

from app.intent import rules
from app.intent.prompts import INTENT_SYSTEM_PROMPT, build_intent_user_prompt
from app.llm_client import llm_client
from app.metrics import record_event
from app.models import ClassifyIntentResponse
from app.config import settings

INTENT_RESULT_RE = re.compile(r"<INTENT_RESULT>(.*?)</INTENT_RESULT>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1  # matches Phase 4's tolerance for one bad LLM turn


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_result(raw_reply: str) -> dict | None:
    match = INTENT_RESULT_RE.search(raw_reply)
    json_str = _strip_code_fences(match.group(1).strip()) if match else _strip_code_fences(raw_reply)
    try:
        data = json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    intent = data.get("intent")
    if intent not in rules.VALID_INTENTS:
        return None
    try:
        confidence = rules.clamp_confidence(float(data.get("confidence", 0.6)))
    except (TypeError, ValueError):
        confidence = 0.6
    return {"intent": intent, "confidence": confidence}


class IntentClassifier:
    def classify(self, user_id: str, message: str) -> ClassifyIntentResponse:
        fast = rules.fast_path_classify(message)
        if fast is not None:
            intent, confidence = fast
            record_event("intent_classified", mode="fast_path", user_id=user_id, intent=intent)
            return ClassifyIntentResponse(intent=intent, confidence=confidence)

        messages = [
            {"role": "system", "content": INTENT_SYSTEM_PROMPT},
            {"role": "user", "content": build_intent_user_prompt(message)},
        ]

        for attempt in range(MAX_PARSE_RETRIES + 1):
            raw_reply = llm_client.chat(
                messages, temperature=0.1, max_tokens=60, model=settings.INTENT_LLM_MODEL,
            )
            result = _extract_result(raw_reply)
            if result is not None:
                record_event(
                    "intent_classified", mode="llm", user_id=user_id, intent=result["intent"],
                )
                return ClassifyIntentResponse(intent=result["intent"], confidence=result["confidence"])

            print(
                f"[intent] Failed to parse intent result for user {user_id!r} "
                f"(attempt {attempt + 1}). Raw reply:\n{raw_reply}"
            )
            record_event("intent_parse_failure", attempt=attempt + 1, user_id=user_id)
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({
                "role": "system",
                "content": (
                    "Your last output could not be parsed. Output ONLY a single "
                    "<INTENT_RESULT>...</INTENT_RESULT> block containing valid JSON with "
                    "\"intent\" (one of the six listed) and \"confidence\" (0-1), nothing else."
                ),
            })

        # Deterministic fallback — the message still needs SOME routing
        # decision, so don't drop it over an LLM hiccup; fall back to a
        # low-confidence keyword guess instead of failing the request.
        record_event("intent_classification_fallback", user_id=user_id)
        intent = rules.deterministic_keyword_classify(message)
        return ClassifyIntentResponse(intent=intent, confidence=rules.FALLBACK_CONFIDENCE)


intent_classifier = IntentClassifier()
