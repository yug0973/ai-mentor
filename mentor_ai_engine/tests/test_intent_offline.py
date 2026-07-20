"""
Offline end-to-end test for Phase 5 (Intent Parser).

Groq's API isn't reachable from this sandboxed environment, so this
monkeypatches LLMClient.chat with canned classification replies, same
pattern as tests/test_adaptive_offline.py. Exercises: fast-path shortcuts
(empty message, bare quiz-option reply — no LLM call at all), a real LLM
classification, the deterministic keyword fallback when the LLM never
returns parseable output, and MOCK_LLM=true mode.

Run: python tests/test_intent_offline.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("MOCK_LLM", "false")

from app import llm_client as llm_client_module  # noqa: E402

RESPONSES = iter([])


def fake_chat(self, messages, temperature=0.7, max_tokens=800, model=None):
    try:
        return next(RESPONSES)
    except StopIteration:
        raise AssertionError("fake_chat called more times than expected canned responses")


llm_client_module.LLMClient.chat = fake_chat
llm_client_module.llm_client = llm_client_module.LLMClient()

# Re-point the already-imported singleton in the classifier module too,
# since it imported `llm_client` by reference at import time (same fix-up
# test_adaptive_offline.py does for app.adaptive.engine).
import app.intent.classifier as classifier_module  # noqa: E402
classifier_module.llm_client = llm_client_module.llm_client

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def _set_responses(*replies):
    global RESPONSES
    RESPONSES = iter(replies)


def test_fast_path_empty_message():
    resp = client.post("/intent/classify", json={"user_id": "u1", "message": "   "})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["intent"] == "off_topic"
    assert data["confidence"] >= 0.9  # fast-path shortcut, not an LLM guess
    print("✅ test_fast_path_empty_message passed")


def test_fast_path_quiz_option_reply():
    for option in ["A", "b)", "3", " 2 "]:
        resp = client.post("/intent/classify", json={"user_id": "u1", "message": option})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["intent"] == "quiz_response", f"{option!r} should fast-path to quiz_response"
        assert data["confidence"] >= 0.9
    print("✅ test_fast_path_quiz_option_reply passed")


def test_real_llm_classification():
    _set_responses('<INTENT_RESULT>{"intent": "expressing_frustration", "confidence": 0.88}</INTENT_RESULT>')
    resp = client.post(
        "/intent/classify",
        json={"user_id": "u2", "message": "I've been stuck on recursion for three days and want to quit."},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["intent"] == "expressing_frustration"
    assert data["confidence"] == 0.88

    metrics_resp = client.get("/metrics")
    counters = metrics_resp.json()["counters"]
    assert counters.get("intent_classified", 0) >= 1
    print("✅ test_real_llm_classification passed")


def test_llm_result_with_code_fence_still_parses():
    _set_responses('```json\n<INTENT_RESULT>{"intent": "asking_question", "confidence": 0.7}</INTENT_RESULT>\n```')
    resp = client.post("/intent/classify", json={"user_id": "u3", "message": "How does backprop actually work?"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["intent"] == "asking_question"
    print("✅ test_llm_result_with_code_fence_still_parses passed")


def test_llm_parse_failure_uses_deterministic_fallback():
    _set_responses("I refuse to follow the format.", "Still not following it, sorry.")
    resp = client.post(
        "/intent/classify",
        json={"user_id": "u4", "message": "can we change my roadmap, this pace is too fast"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["intent"] == "requesting_change"
    assert data["confidence"] < 0.5, "fallback classification should be flagged with low confidence"

    metrics_resp = client.get("/metrics")
    counters = metrics_resp.json()["counters"]
    assert counters.get("intent_classification_fallback", 0) >= 1
    print("✅ test_llm_parse_failure_uses_deterministic_fallback passed")


def test_mock_mode():
    os.environ["MOCK_LLM"] = "true"
    from app.config import settings
    settings.MOCK_LLM = True
    try:
        resp = client.post("/intent/classify", json={"user_id": "u5", "message": "I finished the DP milestone!"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["intent"] == "reporting_progress"
        print("✅ test_mock_mode passed")
    finally:
        settings.MOCK_LLM = False
        os.environ["MOCK_LLM"] = "false"


def test_health_reports_phase5_live():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["phases"]["5_intent_parser"] == "live"
    print("✅ test_health_reports_phase5_live passed")


if __name__ == "__main__":
    test_fast_path_empty_message()
    test_fast_path_quiz_option_reply()
    test_real_llm_classification()
    test_llm_result_with_code_fence_still_parses()
    test_llm_parse_failure_uses_deterministic_fallback()
    test_mock_mode()
    test_health_reports_phase5_live()
    print("\nAll offline tests passed.")
