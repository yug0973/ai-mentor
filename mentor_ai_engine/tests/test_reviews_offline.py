"""
Offline end-to-end test for Phase 7 (Weekly Review Generator).

Groq's API isn't reachable from this sandboxed environment, so this
monkeypatches LLMClient.chat with canned replies, same pattern as
tests/test_nudges_offline.py, tests/test_adaptive_offline.py, and
tests/test_intent_offline.py. Exercises: brand-new user with zero history
(fully deterministic, no LLM call), an in-window session that clearly
improves a topic's mastery, a topic pushed to the mastery ceiling before the
review window so an in-window session on it reads as stagnant, a "quiet
week" (has history, but nothing logged in the last 7 days), the
deterministic fallback when the LLM never returns parseable output, and
MOCK_LLM=true mode.

Session timestamps are backdated directly on the in-memory store after
logging through the real `/sessions/log` endpoint, so the rule layer
(app/reviews/rules.py) is exercised against realistic SessionRecord objects
rather than hand-built ones — same technique as test_nudges_offline.py.

Run: python tests/test_reviews_offline.py
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
# app.adaptive.engine, app.intent.classifier, and app.nudges.engine).
import app.reviews.engine as engine_module  # noqa: E402
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


def test_no_history_fully_deterministic_no_llm_call():
    _set_responses()  # no canned replies — a call here would raise
    resp = client.post("/reviews/weekly/brand-new-user")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["sessions_completed"] == 0
    assert data["total_hours"] == 0.0
    assert data["topics_improved"] == []
    assert data["topics_stagnant"] == []
    assert data["goal_progress_percent"] == 0.0
    assert "get started" in data["next_week_focus"].lower()
    print("✅ test_no_history_fully_deterministic_no_llm_call passed")


def test_active_week_topic_improved():
    _set_responses(
        "<NEXT_WEEK_FOCUS>\nKeep building on this week's momentum.\n</NEXT_WEEK_FOCUS>\n"
        "<MOTIVATIONAL_INSIGHT>\nGreat first week — one solid session logged.\n</MOTIVATIONAL_INSIGHT>"
    )
    user = "improved_user"
    log(user, ["t_new"], 30, "medium")  # fresh topic: 0 -> 0.15, clears IMPROVEMENT_THRESHOLD easily

    resp = client.post(f"/reviews/weekly/{user}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["sessions_completed"] == 1
    assert data["total_hours"] == 0.5
    assert "t_new" in data["topics_improved"]
    assert "t_new" not in data["topics_stagnant"]
    assert "momentum" in data["next_week_focus"].lower()
    print("✅ test_active_week_topic_improved passed")


def test_topic_at_ceiling_reads_as_stagnant():
    _set_responses(
        "<NEXT_WEEK_FOCUS>\nRevisit this topic with fresh eyes next week.\n</NEXT_WEEK_FOCUS>\n"
        "<MOTIVATIONAL_INSIGHT>\nYou're deep into this one already — nearly mastered.\n</MOTIVATIONAL_INSIGHT>"
    )
    user = "stagnant_user"
    # Long, easy session pushes mastery to the 1.0 ceiling (session_units=10
    # saturates learning_rate at 1.0, closing the full gap in one shot),
    # backdated outside the review window.
    log(user, ["t_maxed"], 300, "medium")
    _age_last_session(user, days_ago=10)
    # In-window session on the same topic can't move a maxed-out score —
    # delta is ~0, well under IMPROVEMENT_THRESHOLD.
    log(user, ["t_maxed"], 30, "hard")

    resp = client.post(f"/reviews/weekly/{user}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["sessions_completed"] == 1  # only the in-window session counts
    assert "t_maxed" in data["topics_stagnant"]
    assert "t_maxed" not in data["topics_improved"]
    print("✅ test_topic_at_ceiling_reads_as_stagnant passed")


def test_quiet_week_still_gets_llm_message():
    _set_responses(
        "<NEXT_WEEK_FOCUS>\nEven a short session would help keep things moving.\n</NEXT_WEEK_FOCUS>\n"
        "<MOTIVATIONAL_INSIGHT>\nIt's been quiet this week, but your progress so far still counts.\n</MOTIVATIONAL_INSIGHT>"
    )
    user = "quiet_user"
    log(user, ["t1"], 30, "medium")
    _age_last_session(user, days_ago=12)  # has history, but not in the last 7 days

    resp = client.post(f"/reviews/weekly/{user}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["sessions_completed"] == 0
    assert data["topics_improved"] == []
    assert data["topics_stagnant"] == []
    assert "quiet" in data["motivational_insight"].lower() or "still counts" in data["motivational_insight"].lower()
    print("✅ test_quiet_week_still_gets_llm_message passed")


def test_llm_parse_failure_uses_deterministic_fallback():
    _set_responses("I won't follow the format.", "Still not following it.")
    user = "fallback_user"
    log(user, ["t1"], 60, "medium")

    resp = client.post(f"/reviews/weekly/{user}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "toward your goal" in data["motivational_insight"].lower()

    metrics_resp = client.get("/metrics")
    counters = metrics_resp.json()["counters"]
    assert counters.get("weekly_review_fallback", 0) >= 1
    print("✅ test_llm_parse_failure_uses_deterministic_fallback passed")


def test_mock_mode():
    os.environ["MOCK_LLM"] = "true"
    from app.config import settings
    settings.MOCK_LLM = True
    try:
        resp = client.post("/reviews/weekly/whoever")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "MOCK" in data["motivational_insight"]
        print("✅ test_mock_mode passed")
    finally:
        settings.MOCK_LLM = False
        os.environ["MOCK_LLM"] = "false"


def test_health_reports_phase7_live():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["phases"]["7_weekly_review"] == "live"
    print("✅ test_health_reports_phase7_live passed")


if __name__ == "__main__":
    test_no_history_fully_deterministic_no_llm_call()
    test_active_week_topic_improved()
    test_topic_at_ceiling_reads_as_stagnant()
    test_quiet_week_still_gets_llm_message()
    test_llm_parse_failure_uses_deterministic_fallback()
    test_mock_mode()
    test_health_reports_phase7_live()
    print("\nAll offline tests passed.")
