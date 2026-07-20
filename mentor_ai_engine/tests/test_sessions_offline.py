"""
Offline test for Phase 3 (Session Tracker / Memory Layer).
No LLM involved, so no monkeypatching needed — this is pure deterministic
logic, run straight through the real FastAPI endpoint.

Run: python tests/test_sessions_offline.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("MOCK_LLM", "false")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.memory.store import memory_store  # noqa: E402

client = TestClient(app)


def log(user_id, topics, minutes, difficulty=None, roadmap_id="r1"):
    resp = client.post("/sessions/log", json={
        "user_id": user_id,
        "roadmap_id": roadmap_id,
        "topic_ids_covered": topics,
        "duration_minutes": minutes,
        "self_rated_difficulty": difficulty,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_first_session_increases_mastery_from_zero():
    data = log("alice", ["t1"], 30, "medium")
    assert data["logged"] is True
    assert len(data["updated_mastery"]) == 1
    m = data["updated_mastery"][0]
    assert m["topic_id"] == "t1"
    # 30 min = 1 reference unit, medium -> learning_rate = 0.15, gap = 1.0 -> new = 0.15
    assert abs(m["mastery_score"] - 0.15) < 1e-6
    print("✅ test_first_session_increases_mastery_from_zero passed")


def test_mastery_compounds_and_approaches_ceiling():
    user = "bob"
    scores = []
    for _ in range(10):
        data = log(user, ["t1"], 30, "medium")
        scores.append(data["updated_mastery"][0]["mastery_score"])
    # strictly increasing
    assert all(scores[i] < scores[i + 1] for i in range(len(scores) - 1)), scores
    # never exceeds 1.0
    assert all(s <= 1.0 for s in scores)
    # diminishing returns: the gain from session 10 is smaller than from session 1
    gain_first = scores[0] - 0.0
    gain_last = scores[-1] - scores[-2]
    assert gain_last < gain_first, (gain_first, gain_last)
    print(f"✅ test_mastery_compounds_and_approaches_ceiling passed (scores: {scores})")


def test_difficulty_modifier_direction():
    easy_score = log("carol_easy", ["t1"], 30, "easy")["updated_mastery"][0]["mastery_score"]
    medium_score = log("carol_medium", ["t1"], 30, "medium")["updated_mastery"][0]["mastery_score"]
    hard_score = log("carol_hard", ["t1"], 30, "hard")["updated_mastery"][0]["mastery_score"]
    assert easy_score > medium_score > hard_score, (easy_score, medium_score, hard_score)
    print(f"✅ test_difficulty_modifier_direction passed (easy={easy_score}, medium={medium_score}, hard={hard_score})")


def test_multi_topic_session_splits_time_evenly():
    data = log("dave", ["t1", "t2"], 60, "medium")  # 30 min per topic
    scores = {m["topic_id"]: m["mastery_score"] for m in data["updated_mastery"]}
    assert set(scores.keys()) == {"t1", "t2"}
    assert abs(scores["t1"] - 0.15) < 1e-6
    assert abs(scores["t2"] - 0.15) < 1e-6
    print("✅ test_multi_topic_session_splits_time_evenly passed")


def test_empty_topics_covered_does_not_crash():
    data = log("erin", [], 30, "medium")
    assert data["logged"] is True
    assert data["updated_mastery"] == []
    print("✅ test_empty_topics_covered_does_not_crash passed")


def test_users_are_isolated():
    log("frank", ["t1"], 30, "medium")
    frank_map = memory_store.get_mastery_map("frank")
    grace_map = memory_store.get_mastery_map("grace")  # never logged anything
    assert "t1" in frank_map
    assert grace_map == {}
    print("✅ test_users_are_isolated passed")


def test_session_history_retained_for_future_phases():
    log("henry", ["t1"], 45, "hard", roadmap_id="rmap-9")
    log("henry", ["t2"], 15, "easy", roadmap_id="rmap-9")
    sessions = memory_store.get_sessions("henry")
    assert len(sessions) == 2
    assert sessions[0].roadmap_id == "rmap-9"
    assert sessions[1].duration_minutes == 15
    print("✅ test_session_history_retained_for_future_phases passed")


def test_metrics_recorded():
    log("ivan", ["t1"], 30, "medium")
    counters = client.get("/metrics").json()["counters"]
    assert counters.get("session_logged", 0) >= 1
    print("✅ test_metrics_recorded passed")


if __name__ == "__main__":
    test_first_session_increases_mastery_from_zero()
    test_mastery_compounds_and_approaches_ceiling()
    test_difficulty_modifier_direction()
    test_multi_topic_session_splits_time_evenly()
    test_empty_topics_covered_does_not_crash()
    test_users_are_isolated()
    test_session_history_retained_for_future_phases()
    test_metrics_recorded()
    print("\nAll offline tests passed.")
