"""
Offline end-to-end test for Phase 6 (Motivation Detector / Nudges).

Groq's API isn't reachable from this sandboxed environment, so this
monkeypatches LLMClient.chat with canned nudge-message replies, same pattern
as tests/test_adaptive_offline.py and tests/test_intent_offline.py. Exercises:
no-session-history (no nudge, no LLM call), long/short inactivity, a
session-frequency drop, struggling on recent topics, the deterministic
fallback when the LLM never returns parseable output, and MOCK_LLM=true mode.

Session timestamps are backdated directly on the in-memory store after
logging through the real `/sessions/log` endpoint, so the rule layer
(app/nudges/rules.py) is exercised against realistic SessionRecord objects
rather than hand-built ones.

Run: python tests/test_nudges_offline.py
"""
import os
import sys
from datetime import datetime, timedelta, timezone

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

# Re-point the already-imported singleton in the engine module too, since it
# imported `llm_client` by reference at import time (same fix-up used for
# app.adaptive.engine and app.intent.classifier).
import app.nudges.engine as engine_module  # noqa: E402
engine_module.llm_client = llm_client_module.llm_client

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.memory.store import memory_store  # noqa: E402

client = TestClient(app)


def _set_responses(*replies):
    global RESPONSES
    RESPONSES = iter(replies)


def log(user_id, topics, minutes, difficulty=None, roadmap_id="r1"):
    resp = client.post("/sessions/log", json={
        "user_id": user_id,
        "roadmap_id": roadmap_id,
        "topic_ids_covered": topics,
        "duration_minutes": minutes,
        "self_rated_difficulty": difficulty,
    })
    assert resp.status_code == 200, resp.text


def _age_last_session(user_id: str, days_ago: float):
    record = memory_store._sessions[user_id][-1]
    record.logged_at = datetime.now(timezone.utc) - timedelta(days=days_ago)


def test_no_session_history_no_nudge():
    resp = client.get("/nudges/check/brand-new-user")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["nudge_triggered"] is False
    assert data["trigger_reason"] == "no_session_history"
    assert data["nudge_message"] is None
    print("✅ test_no_session_history_no_nudge passed")


def test_long_inactivity_triggers_with_llm_message():
    _set_responses("<NUDGE_MESSAGE>\nNo rush at all — pick back up whenever you're ready.\n</NUDGE_MESSAGE>")
    log("longinactive_user", ["t1"], 30, "medium")
    _age_last_session("longinactive_user", days_ago=10)

    resp = client.get("/nudges/check/longinactive_user")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["nudge_triggered"] is True
    assert data["trigger_reason"] == "long_inactivity"
    assert data["suggested_action"] == "check_in"
    assert "pick back up" in data["nudge_message"]
    print("✅ test_long_inactivity_triggers_with_llm_message passed")


def test_short_inactivity_triggers():
    _set_responses("<NUDGE_MESSAGE>Haven't seen you in a few days — quick session today?</NUDGE_MESSAGE>")
    log("shortinactive_user", ["t1"], 30, "medium")
    _age_last_session("shortinactive_user", days_ago=4)

    resp = client.get("/nudges/check/shortinactive_user")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["nudge_triggered"] is True
    assert data["trigger_reason"] == "inactivity"
    assert data["suggested_action"] == "offer_lighter_session"
    print("✅ test_short_inactivity_triggers passed")


def test_struggling_triggers():
    _set_responses(
        "<NUDGE_MESSAGE>The last few topics have been tough — want a lighter session next?</NUDGE_MESSAGE>"
    )
    for _ in range(3):
        log("struggling_user", ["t_hard"], 30, "hard")

    resp = client.get("/nudges/check/struggling_user")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["nudge_triggered"] is True
    assert data["trigger_reason"] == "struggling"
    assert data["suggested_action"] == "offer_lighter_session"
    print("✅ test_struggling_triggers passed")


def test_frequency_drop_triggers():
    _set_responses("<NUDGE_MESSAGE>Noticed your pace has slowed down lately — everything okay?</NUDGE_MESSAGE>")
    user = "freqdrop_user"
    # Previous window (7-14 days ago): 3 sessions, easy difficulty (keeps
    # mastery healthy so this doesn't also read as "struggling").
    for days_ago in (12, 11, 10):
        log(user, ["t1"], 30, "easy")
        _age_last_session(user, days_ago=days_ago)
    # Current window: just 1 recent session -> 1 <= 3 * 0.5, and recent
    # enough that inactivity doesn't fire first.
    log(user, ["t1"], 30, "easy")
    _age_last_session(user, days_ago=1)

    resp = client.get(f"/nudges/check/{user}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["nudge_triggered"] is True
    assert data["trigger_reason"] == "frequency_drop"
    print("✅ test_frequency_drop_triggers passed")


def test_llm_parse_failure_uses_deterministic_fallback():
    _set_responses("I won't follow the format.", "Still not following it.")
    log("fallback_user", ["t1"], 30, "medium")
    _age_last_session("fallback_user", days_ago=4)

    resp = client.get("/nudges/check/fallback_user")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["nudge_triggered"] is True
    assert data["trigger_reason"] == "inactivity"
    assert "quick session" in data["nudge_message"].lower() or "session" in data["nudge_message"].lower()

    metrics_resp = client.get("/metrics")
    counters = metrics_resp.json()["counters"]
    assert counters.get("nudge_message_fallback", 0) >= 1
    print("✅ test_llm_parse_failure_uses_deterministic_fallback passed")


def test_mock_mode():
    os.environ["MOCK_LLM"] = "true"
    from app.config import settings
    settings.MOCK_LLM = True
    try:
        resp = client.get("/nudges/check/whoever")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["nudge_triggered"] is True
        assert "MOCK" in data["nudge_message"]
        print("✅ test_mock_mode passed")
    finally:
        settings.MOCK_LLM = False
        os.environ["MOCK_LLM"] = "false"


def test_health_reports_phase6_live():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["phases"]["6_nudges"] == "live"
    print("✅ test_health_reports_phase6_live passed")


if __name__ == "__main__":
    test_no_session_history_no_nudge()
    test_long_inactivity_triggers_with_llm_message()
    test_short_inactivity_triggers()
    test_struggling_triggers()
    test_frequency_drop_triggers()
    test_llm_parse_failure_uses_deterministic_fallback()
    test_mock_mode()
    test_health_reports_phase6_live()
    print("\nAll offline tests passed.")
