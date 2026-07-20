"""
Offline test for Phase 8 (Feedback Loop / Eval Harness).
No LLM involved, so no monkeypatching needed — this is pure deterministic
logic (storage + aggregation), run straight through the real FastAPI
endpoints. Same "no LLM, just run it" shape as test_sessions_offline.py.

Run: python tests/test_feedback_offline.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("MOCK_LLM", "false")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def send(user_id, event_type, reference_id, outcome_note=None):
    resp = client.post("/feedback/event", json={
        "user_id": user_id,
        "event_type": event_type,
        "reference_id": reference_id,
        "outcome_note": outcome_note,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_event_logged_returns_true():
    data = send("alice", "nudge_shown", "nudge-1")
    assert data["logged"] is True
    print("✅ test_event_logged_returns_true passed")


def test_summary_with_no_data_returns_null_rates():
    resp = client.get("/feedback/summary?user_id=brand-new-user")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_events"] == 0
    assert data["nudge_follow_through_rate"] is None
    assert data["roadmap_change_acceptance_rate"] is None
    print("✅ test_summary_with_no_data_returns_null_rates passed")


def test_nudge_follow_through_rate():
    user = "bob"
    send(user, "nudge_shown", "n1")
    send(user, "nudge_followed", "n1")
    send(user, "nudge_shown", "n2")
    send(user, "nudge_ignored", "n2")
    send(user, "nudge_shown", "n3")
    send(user, "nudge_followed", "n3")

    data = client.get(f"/feedback/summary?user_id={user}").json()
    # 2 followed, 1 ignored -> 2/3 (eval.py rounds to 4 decimals, so allow for that)
    assert abs(data["nudge_follow_through_rate"] - (2 / 3)) < 1e-3
    assert data["event_counts"]["nudge_followed"] == 2
    assert data["event_counts"]["nudge_ignored"] == 1
    print("✅ test_nudge_follow_through_rate passed")


def test_roadmap_change_acceptance_rate():
    user = "carol"
    send(user, "roadmap_change_accepted", "rc1")
    send(user, "roadmap_change_accepted", "rc2")
    send(user, "roadmap_change_reverted", "rc3")

    data = client.get(f"/feedback/summary?user_id={user}").json()
    # 2 accepted, 1 reverted -> 2/3 (eval.py rounds to 4 decimals, so allow for that)
    assert abs(data["roadmap_change_acceptance_rate"] - (2 / 3)) < 1e-3
    print("✅ test_roadmap_change_acceptance_rate passed")


def test_users_are_isolated_in_summary():
    send("dave", "nudge_followed", "n1")
    dave_data = client.get("/feedback/summary?user_id=dave").json()
    erin_data = client.get("/feedback/summary?user_id=erin").json()  # never logged anything
    assert dave_data["total_events"] >= 1
    assert erin_data["total_events"] == 0
    print("✅ test_users_are_isolated_in_summary passed")


def test_global_summary_includes_all_users():
    # Uses events from earlier tests in this run (alice, bob, carol, dave) —
    # global summary (no user_id filter) should reflect all of them.
    data = client.get("/feedback/summary").json()
    assert data["total_events"] >= 10
    assert data["distinct_users"] >= 4
    print("✅ test_global_summary_includes_all_users passed")


def test_outcome_note_and_metrics_recorded():
    send("frank", "nudge_followed", "n1", outcome_note="did a quick session, felt good")
    counters = client.get("/metrics").json()["counters"]
    assert counters.get("feedback_logged", 0) >= 1
    print("✅ test_outcome_note_and_metrics_recorded passed")


def test_health_reports_phase8_live():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["phases"]["8_feedback_loop"] == "live"
    print("✅ test_health_reports_phase8_live passed")


if __name__ == "__main__":
    test_event_logged_returns_true()
    test_summary_with_no_data_returns_null_rates()
    test_nudge_follow_through_rate()
    test_roadmap_change_acceptance_rate()
    test_users_are_isolated_in_summary()
    test_global_summary_includes_all_users()
    test_outcome_note_and_metrics_recorded()
    test_health_reports_phase8_live()
    print("\nAll offline tests passed.")
