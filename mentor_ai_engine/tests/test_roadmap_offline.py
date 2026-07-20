"""
Offline end-to-end test for Phase 2 (Roadmap Generator).

Groq's API isn't reachable from this sandboxed environment, so this monkeypatches
LLMClient.chat with canned two-pass responses that mimic exactly what a real model
would return, to verify: parsing, id assignment, prerequisite resolution (DAG
validity), known-skill status resolution, and full schema validity end-to-end
through the actual FastAPI endpoint. Also exercises MOCK_LLM=true mode.

Run: python tests/test_roadmap_offline.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("MOCK_LLM", "false")

from app import llm_client as llm_client_module  # noqa: E402

# ---- canned responses, one per expected LLM call, in order ----
MILESTONE_REPLY = """<MILESTONES>
[
  {"title": "Python & Git Fundamentals"},
  {"title": "Backend APIs with FastAPI"},
  {"title": "Databases & Persistence"},
  {"title": "Ship a Job-Ready Backend Project"}
]
</MILESTONES>"""

TOPICS_M1 = """<TOPICS>
[
  {"title": "Python Basics", "description": "Core syntax, control flow, functions.", "estimated_hours": 8, "prerequisites": []},
  {"title": "Git & Version Control", "description": "Branching, commits, PR workflow.", "estimated_hours": 4, "prerequisites": ["Python Basics"]}
]
</TOPICS>"""

TOPICS_M2 = """<TOPICS>
[
  {"title": "REST API Design", "description": "Routes, status codes, request/response shapes.", "estimated_hours": 6, "prerequisites": ["Git & Version Control"]},
  {"title": "FastAPI Deep Dive", "description": "Pydantic models, dependency injection, routers.", "estimated_hours": 10, "prerequisites": ["REST API Design"]}
]
</TOPICS>"""

TOPICS_M3 = """<TOPICS>
[
  {"title": "Relational DB Design", "description": "Schema design, normalization.", "estimated_hours": 6, "prerequisites": ["FastAPI Deep Dive"]},
  {"title": "SQL Querying", "description": "Joins, aggregation, indexing basics.", "estimated_hours": 6, "prerequisites": ["Relational DB Design"]},
  {"title": "Nonexistent Prereq Topic", "description": "Should drop invalid prereq gracefully.", "estimated_hours": 3, "prerequisites": ["This Prereq Does Not Exist"]}
]
</TOPICS>"""

TOPICS_M4 = """<TOPICS>
[
  {"title": "Build a Small Project", "description": "End-to-end backend project for the portfolio.", "estimated_hours": 20, "prerequisites": ["SQL Querying"]}
]
</TOPICS>"""

RESPONSES = iter([MILESTONE_REPLY, TOPICS_M1, TOPICS_M2, TOPICS_M3, TOPICS_M4])


def fake_chat(self, messages, temperature=0.7, max_tokens=800):
    try:
        return next(RESPONSES)
    except StopIteration:
        raise AssertionError("fake_chat called more times than expected canned responses")


llm_client_module.LLMClient.chat = fake_chat
llm_client_module.llm_client = llm_client_module.LLMClient()

# Re-point the already-imported singleton in the generator module too,
# since it imported `llm_client` by reference at import time.
import app.roadmap.generator as generator_module  # noqa: E402
generator_module.llm_client = llm_client_module.llm_client

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)

PROFILE = {
    "goal": "job-ready in backend dev",
    "domain": "backend",
    "current_level": "beginner",
    "timeline_weeks": 12,
    "hours_per_week": 8,
    "known_skills": ["python basics"],  # should mark "Python Basics" topic as completed
    "weak_areas": [],
    "preferred_learning_style": "project-based",
    "motivation_type": "career-switch",
    "constraints": ["works full-time"],
}


def test_real_generation():
    resp = client.post("/roadmap/generate", json={"user_id": "u1", "learner_profile": PROFILE})
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["user_id"] == "u1"
    assert data["goal"] == PROFILE["goal"]
    assert len(data["milestones"]) == 4, "expected 4 milestones from canned reply"

    all_topic_ids = set()
    for m in data["milestones"]:
        assert m["milestone_id"].startswith("m")
        assert m["checkpoint_quiz_id"] == f"quiz-{m['milestone_id']}"
        for t in m["topics"]:
            assert t["topic_id"].startswith("t")
            all_topic_ids.add(t["topic_id"])

    # DAG validity: every prerequisite id referenced must exist among generated topics
    for m in data["milestones"]:
        for t in m["topics"]:
            for prereq_id in t["prerequisites"]:
                assert prereq_id in all_topic_ids, f"dangling prerequisite id {prereq_id}"

    # known_skills matching: "Python Basics" topic should be marked completed
    m1_topics = {t["title"]: t for t in data["milestones"][0]["topics"]}
    assert m1_topics["Python Basics"]["status"] == "completed"
    assert m1_topics["Git & Version Control"]["status"] == "locked"  # has an unmet prereq

    # invalid/hallucinated prerequisite title should be silently dropped, not crash
    m3_topics = {t["title"]: t for t in data["milestones"][2]["topics"]}
    assert m3_topics["Nonexistent Prereq Topic"]["prerequisites"] == []
    assert m3_topics["Nonexistent Prereq Topic"]["status"] == "available"  # no valid prereqs left

    # ids are globally unique and sequential across the whole roadmap
    all_ids_in_order = [t["topic_id"] for m in data["milestones"] for t in m["topics"]]
    assert all_ids_in_order == [f"t{i+1}" for i in range(len(all_ids_in_order))]

    print("✅ test_real_generation passed")
    print(f"   milestones: {[m['title'] for m in data['milestones']]}")
    print(f"   total topics: {len(all_ids_in_order)}")


def test_mock_mode():
    os.environ["MOCK_LLM"] = "true"
    from app.config import settings
    settings.MOCK_LLM = True
    try:
        resp = client.post("/roadmap/generate", json={"user_id": "u2", "learner_profile": PROFILE})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["roadmap_id"] == "mock-roadmap-001"
        assert data["user_id"] == "u2"
        print("✅ test_mock_mode passed")
    finally:
        settings.MOCK_LLM = False
        os.environ["MOCK_LLM"] = "false"


def test_retry_on_malformed_then_fallback_to_mock():
    """If the model never produces a parseable block, we should degrade to mock, not 500."""
    def always_bad_chat(self, messages, temperature=0.7, max_tokens=800):
        return "I'm not going to follow the format, sorry."

    original = llm_client_module.LLMClient.chat
    llm_client_module.LLMClient.chat = always_bad_chat
    generator_module.llm_client.chat = lambda *a, **kw: always_bad_chat(None, *a, **kw)
    try:
        resp = client.post("/roadmap/generate", json={"user_id": "u3", "learner_profile": PROFILE})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["roadmap_id"] == "mock-roadmap-001", "should have fallen back to mock roadmap"

        metrics_resp = client.get("/metrics")
        counters = metrics_resp.json()["counters"]
        assert counters.get("roadmap_generation_fallback", 0) >= 1, "fallback event should be recorded"
        assert counters.get("roadmap_milestone_parse_failure", 0) >= 1, "parse failure event should be recorded"
        print("✅ test_retry_on_malformed_then_fallback_to_mock passed")
        print(f"   metrics counters: {counters}")
    finally:
        llm_client_module.LLMClient.chat = original


def test_health_and_docs():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["phases"]["2_roadmap_generator"] in ("live", "stub")  # sanity, checked below in main.py update
    print("✅ test_health_and_docs passed (health endpoint reachable)")


if __name__ == "__main__":
    test_real_generation()
    test_mock_mode()
    test_retry_on_malformed_then_fallback_to_mock()
    test_health_and_docs()
    print("\nAll offline tests passed.")
