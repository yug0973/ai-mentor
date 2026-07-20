"""
Offline end-to-end test for Phase 4 (Adaptive Roadmap Engine).

Groq's API isn't reachable from this sandboxed environment, so this
monkeypatches LLMClient.chat with a canned remediation-topic response, same
pattern as tests/test_roadmap_offline.py. Exercises: weak-topic detection
(quiz + mastery combined), remediation-topic insertion and DAG rewiring,
milestone-pass completion + downstream unlocking, the not-found-in-store
fallback, MOCK_LLM=true mode, and the deterministic fallback when the LLM
returns unparseable output.

Run: python tests/test_adaptive_offline.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("MOCK_LLM", "false")

from app import llm_client as llm_client_module  # noqa: E402

REMEDIATION_REPLY = """<REMEDIATION_TOPICS>
[
  {"title": "Recursion Fundamentals — Extra Practice", "description": "Redo base-case/recursive-case drills.", "estimated_hours": 3}
]
</REMEDIATION_TOPICS>"""

RESPONSES = iter([REMEDIATION_REPLY])


def fake_chat(self, messages, temperature=0.7, max_tokens=800):
    try:
        return next(RESPONSES)
    except StopIteration:
        raise AssertionError("fake_chat called more times than expected canned responses")


llm_client_module.LLMClient.chat = fake_chat
llm_client_module.llm_client = llm_client_module.LLMClient()

# Re-point the already-imported singleton in the engine module too, since it
# imported `llm_client` by reference at import time (same fix-up
# test_roadmap_offline.py does for app.roadmap.generator).
import app.adaptive.engine as engine_module  # noqa: E402
engine_module.llm_client = llm_client_module.llm_client

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Roadmap, RoadmapMilestone, RoadmapTopic  # noqa: E402
from app.roadmap.store import roadmap_store  # noqa: E402

client = TestClient(app)


def build_test_roadmap(roadmap_id: str) -> Roadmap:
    return Roadmap(
        roadmap_id=roadmap_id,
        user_id="u1",
        goal="ace the DSA interview loop",
        progress_percent=0.0,
        milestones=[
            RoadmapMilestone(
                milestone_id="m1",
                title="DSA Foundations",
                checkpoint_quiz_id="quiz-m1",
                topics=[
                    RoadmapTopic(
                        topic_id="t1", title="Arrays & Strings",
                        description="Core array/string manipulation.",
                        estimated_hours=6, status="available", prerequisites=[],
                    ),
                    RoadmapTopic(
                        topic_id="t2", title="Recursion & Backtracking",
                        description="Base cases, recursive cases, backtracking search.",
                        estimated_hours=8, status="available", prerequisites=[],
                    ),
                ],
            ),
            RoadmapMilestone(
                milestone_id="m2",
                title="Applied DSA",
                checkpoint_quiz_id="quiz-m2",
                topics=[
                    RoadmapTopic(
                        topic_id="t3", title="Dynamic Programming",
                        description="Builds on recursion.",
                        estimated_hours=10, status="locked", prerequisites=["t2"],
                    ),
                ],
            ),
        ],
    )


def test_weak_topic_remediation_and_unlock():
    roadmap = build_test_roadmap("rm-weak-001")
    roadmap_store.save(roadmap)

    payload = {
        "user_id": "u1",
        "roadmap_id": "rm-weak-001",
        "milestone_id": "m1",
        "quiz_id": "quiz-m1",
        "score_percent": 72.0,  # milestone-level pass
        "topic_breakdown": {"t1": 90.0, "t2": 35.0},  # t2 is weak
    }
    resp = client.post("/roadmap/adapt", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["roadmap_id"] == "rm-weak-001"
    assert data["changed"] is True

    m1 = next(m for m in data["updated_roadmap"]["milestones"] if m["milestone_id"] == "m1")
    titles = [t["title"] for t in m1["topics"]]
    assert "Recursion Fundamentals — Extra Practice" in titles, "remediation topic should be inserted"

    remediation = next(t for t in m1["topics"] if t["title"] == "Recursion Fundamentals — Extra Practice")
    original = next(t for t in m1["topics"] if t["title"] == "Recursion & Backtracking")

    # original topic now depends on its remediation topic and is locked again
    assert remediation["topic_id"] in original["prerequisites"]
    assert original["status"] == "locked"
    assert original["estimated_hours"] > 8, "weak topic's hours should be bumped up"

    # t1 scored well and milestone passed overall -> marked completed
    t1 = next(t for t in m1["topics"] if t["topic_id"] == "t1")
    assert t1["status"] == "completed"

    # t3 in m2 depended only on t2, which is now locked again behind
    # remediation -> should NOT have unlocked
    m2 = next(m for m in data["updated_roadmap"]["milestones"] if m["milestone_id"] == "m2")
    t3 = next(t for t in m2["topics"] if t["topic_id"] == "t3")
    assert t3["status"] == "locked"

    print("✅ test_weak_topic_remediation_and_unlock passed")


def test_pass_with_no_weak_topics_unlocks_downstream():
    roadmap = build_test_roadmap("rm-pass-001")
    roadmap_store.save(roadmap)

    payload = {
        "user_id": "u2",
        "roadmap_id": "rm-pass-001",
        "milestone_id": "m1",
        "quiz_id": "quiz-m1",
        "score_percent": 95.0,
        "topic_breakdown": {"t1": 95.0, "t2": 92.0},
    }
    resp = client.post("/roadmap/adapt", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["changed"] is True  # topics got marked completed + m2's t3 unlocked

    m1 = next(m for m in data["updated_roadmap"]["milestones"] if m["milestone_id"] == "m1")
    assert all(t["status"] == "completed" for t in m1["topics"])

    m2 = next(m for m in data["updated_roadmap"]["milestones"] if m["milestone_id"] == "m2")
    t3 = next(t for t in m2["topics"] if t["topic_id"] == "t3")
    assert t3["status"] == "available", "t3's only prerequisite (t2) is now completed"

    print("✅ test_pass_with_no_weak_topics_unlocks_downstream passed")


def test_roadmap_not_found_falls_back_to_mock():
    payload = {
        "user_id": "u3",
        "roadmap_id": "does-not-exist-in-store",
        "milestone_id": "m1",
        "quiz_id": "quiz-m1",
        "score_percent": 50.0,
        "topic_breakdown": {},
    }
    resp = client.post("/roadmap/adapt", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["roadmap_id"] == "does-not-exist-in-store"
    assert "MOCK" in data["change_summary"]

    metrics_resp = client.get("/metrics")
    counters = metrics_resp.json()["counters"]
    assert counters.get("adaptive_roadmap_not_found", 0) >= 1

    print("✅ test_roadmap_not_found_falls_back_to_mock passed")


def test_unknown_milestone_id_falls_back_to_mock():
    roadmap = build_test_roadmap("rm-badmilestone-001")
    roadmap_store.save(roadmap)

    payload = {
        "user_id": "u4",
        "roadmap_id": "rm-badmilestone-001",
        "milestone_id": "m-does-not-exist",
        "quiz_id": "quiz-x",
        "score_percent": 50.0,
        "topic_breakdown": {},
    }
    resp = client.post("/roadmap/adapt", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "MOCK" in data["change_summary"]

    metrics_resp = client.get("/metrics")
    counters = metrics_resp.json()["counters"]
    assert counters.get("adaptive_adaptation_fallback", 0) >= 1

    print("✅ test_unknown_milestone_id_falls_back_to_mock passed")


def test_mock_mode():
    os.environ["MOCK_LLM"] = "true"
    from app.config import settings
    settings.MOCK_LLM = True
    try:
        payload = {
            "user_id": "u5",
            "roadmap_id": "rm-whatever",
            "milestone_id": "m1",
            "quiz_id": "quiz-m1",
            "score_percent": 50.0,
            "topic_breakdown": {},
        }
        resp = client.post("/roadmap/adapt", json=payload)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["roadmap_id"] == "rm-whatever"
        assert data["changed"] is True
        print("✅ test_mock_mode passed")
    finally:
        settings.MOCK_LLM = False
        os.environ["MOCK_LLM"] = "false"


def test_llm_parse_failure_uses_deterministic_fallback():
    """If the model never produces a parseable remediation block, the rule
    layer's decision to remediate should still go through, just with
    templated copy instead of LLM-authored copy."""
    def always_bad_chat(self, messages, temperature=0.7, max_tokens=800):
        return "I'm not going to follow the format, sorry."

    original = llm_client_module.LLMClient.chat
    llm_client_module.LLMClient.chat = always_bad_chat
    engine_module.llm_client.chat = lambda *a, **kw: always_bad_chat(None, *a, **kw)
    try:
        roadmap = build_test_roadmap("rm-badllm-001")
        roadmap_store.save(roadmap)
        payload = {
            "user_id": "u6",
            "roadmap_id": "rm-badllm-001",
            "milestone_id": "m1",
            "quiz_id": "quiz-m1",
            "score_percent": 40.0,
            "topic_breakdown": {"t1": 40.0, "t2": 20.0},
        }
        resp = client.post("/roadmap/adapt", json=payload)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["changed"] is True

        m1 = next(m for m in data["updated_roadmap"]["milestones"] if m["milestone_id"] == "m1")
        titles = [t["title"] for t in m1["topics"]]
        assert any("Extra Practice" in t for t in titles), "deterministic fallback title should be used"

        metrics_resp = client.get("/metrics")
        counters = metrics_resp.json()["counters"]
        assert counters.get("adaptive_remediation_fallback", 0) >= 1
        print("✅ test_llm_parse_failure_uses_deterministic_fallback passed")
    finally:
        llm_client_module.LLMClient.chat = original


def test_health_reports_phase4_live():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["phases"]["4_adaptive_roadmap"] == "live"
    print("✅ test_health_reports_phase4_live passed")


if __name__ == "__main__":
    test_weak_topic_remediation_and_unlock()
    test_pass_with_no_weak_topics_unlocks_downstream()
    test_roadmap_not_found_falls_back_to_mock()
    test_unknown_milestone_id_falls_back_to_mock()
    test_mock_mode()
    test_llm_parse_failure_uses_deterministic_fallback()
    test_health_reports_phase4_live()
    print("\nAll offline tests passed.")
