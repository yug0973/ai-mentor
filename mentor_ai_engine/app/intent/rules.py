"""
Deterministic layer for Phase 5 (Intent Parser). Versioned like the other
phases' rule/mastery modules, even though most of the classification work
here is inherently LLM territory (free-text NLU), for two reasons:

1. FAST PATH — this endpoint is called on every single learner message, so
   a couple of cheap, unambiguous, zero-latency shortcuts are worth having
   before paying for an LLM round trip: an empty message, and the very
   common case of a bare quiz-option reply ("A", "3", etc.) that a quiz UI
   is likely to send verbatim rather than as a full sentence.
2. FALLBACK — if the LLM call fails to produce parseable output after a
   retry, we still need to return *something* rather than 500ing (same
   "rule layer never drops the ball over an LLM hiccup" pattern as
   app/adaptive/rules.py + app/adaptive/engine.py). This is intentionally
   simple keyword matching, not a real classifier — it exists purely as a
   safety net, and is marked with a low confidence score so callers can
   tell a fallback classification from a real one.
"""
import re

INTENT_MODEL_VERSION = "intent_v1"

VALID_INTENTS = {
    "asking_question",
    "reporting_progress",
    "expressing_frustration",
    "requesting_change",
    "off_topic",
    "quiz_response",
}

# Bare multiple-choice-style answer: a single letter A-D or digit 1-4,
# optionally with trailing punctuation/whitespace — the common shape a quiz
# UI sends when the learner taps an option rather than typing a sentence.
QUIZ_ANSWER_RE = re.compile(r"^\s*[A-Da-d1-4]\s*[.)]?\s*$")

# Confidence assigned to fast-path shortcuts — high because these patterns
# are unambiguous, not because a model scored them.
FAST_PATH_CONFIDENCE = 0.97

# Confidence assigned to the deterministic keyword fallback when the LLM
# call never returns parseable output. Deliberately low/flagged so
# downstream routing logic (and API consumers) can tell this apart from a
# real model classification, same convention as the original stub's 0.55.
FALLBACK_CONFIDENCE = 0.4

FRUSTRATION_KEYWORDS = [
    "stuck", "frustrat", "give up", "giving up", "can't do this", "cant do this",
    "too hard", "so hard", "impossible", "hate this", "annoyed", "burnt out",
    "burned out", "exhausted", "overwhelmed",
]
REQUESTING_CHANGE_KEYWORDS = [
    "change my", "different roadmap", "different plan", "switch to", "instead of",
    "can we redo", "restart my", "too easy", "too slow", "too fast", "skip ahead",
    "make it harder", "make it easier",
]
REPORTING_PROGRESS_KEYWORDS = [
    "done", "finished", "completed", "i finished", "just finished", "wrapped up",
]
QUESTION_STARTERS = ("what", "how", "why", "when", "where", "which", "can i", "should i", "is it", "do i")


def fast_path_classify(message: str) -> tuple[str, float] | None:
    """
    Returns (intent, confidence) for messages that don't need an LLM call at
    all, or None if the message needs real classification.
    """
    stripped = message.strip()
    if not stripped:
        return "off_topic", FAST_PATH_CONFIDENCE
    if QUIZ_ANSWER_RE.match(stripped):
        return "quiz_response", FAST_PATH_CONFIDENCE
    return None


def deterministic_keyword_classify(message: str) -> str:
    """
    Simple keyword heuristic used ONLY as a last-resort fallback when the
    LLM call fails to produce parseable output after a retry. Not meant to
    be accurate on nuanced messages — just a safe, non-crashing default.
    """
    text = message.lower()
    if any(kw in text for kw in FRUSTRATION_KEYWORDS):
        return "expressing_frustration"
    if any(kw in text for kw in REQUESTING_CHANGE_KEYWORDS):
        return "requesting_change"
    if any(kw in text for kw in REPORTING_PROGRESS_KEYWORDS):
        return "reporting_progress"
    if "?" in text or text.strip().startswith(QUESTION_STARTERS):
        return "asking_question"
    return "off_topic"


def clamp_confidence(value: float) -> float:
    return max(0.0, min(1.0, value))
