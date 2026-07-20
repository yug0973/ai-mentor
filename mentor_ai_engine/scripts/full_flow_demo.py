#!/usr/bin/env python3
"""
End-to-end walkthrough: drives ONE learner through all 8 phases in order,
against a running instance of this service, chaining real IDs from each
response into the next call (session_id -> learner_profile -> roadmap_id ->
topic_ids -> ...).

Works against either MOCK_LLM=true (fast, free, canned text) or
MOCK_LLM=false + a real LLM_API_KEY (slower, real generated text) — same
script either way, since it reads whatever each endpoint actually returns
rather than hardcoding expected values.

Usage:
    # 1. In one terminal:
    uvicorn app.main:app --reload --port 8000

    # 2. In another terminal:
    python scripts/full_flow_demo.py
    python scripts/full_flow_demo.py --base-url http://localhost:8000  # default

Only uses the Python standard library (urllib) so it runs with zero extra
pip installs beyond requirements.txt.
"""
import argparse
import json
import urllib.request
import urllib.error


def call(base_url: str, method: str, path: str, body: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"\n❌ {method} {path} failed: HTTP {e.code}")
        print(e.read().decode())
        raise SystemExit(1)


def banner(title: str) -> None:
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


def pretty(label: str, data) -> None:
    print(f"-- {label} --")
    print(json.dumps(data, indent=2))


# Canned learner answers — generic enough that both the Phase 1 mock script
# (5 fixed questions) and the real LLM-driven interview (which may ask a
# different number/order of questions) can extract a full profile from them.
INTERVIEW_ANSWERS = [
    "I want to become job-ready in backend development within about 3 months.",
    "Backend dev — mainly REST APIs and databases.",
    "I'd call myself a beginner — I know basic Python but haven't built anything real.",
    "I can commit around 12 weeks, roughly 10 hours a week.",
    "I know some basic Python syntax, nothing else yet. I work full-time and learn best by building projects.",
]
MAX_INTERVIEW_TURNS = 10  # matches app/interview/state_machine.py's MAX_TURNS safety cap


def run(base_url: str) -> None:
    user_id = "demo-user"

    # ---------------- Phase 1: Goal Understanding ----------------
    banner("PHASE 1 — Goal Understanding (interview)")
    start = call(base_url, "POST", "/interview/start")
    pretty("mentor opening message", start)
    session_id = start["session_id"]

    profile = None
    for i in range(MAX_INTERVIEW_TURNS):
        answer = INTERVIEW_ANSWERS[i % len(INTERVIEW_ANSWERS)]
        print(f"\n> learner says: {answer}")
        result = call(base_url, "POST", "/interview/message", {
            "session_id": session_id,
            "message": answer,
        })
        if result["status"] == "complete":
            profile = result["learner_profile"]
            pretty("learner_profile (hand-off to Phase 2)", profile)
            break
        print(f"< mentor asks: {result['mentor_message']}")
    if profile is None:
        print("\n❌ Interview never completed within the turn cap — inspect manually.")
        raise SystemExit(1)

    # ---------------- Phase 2: Roadmap Generator ----------------
    banner("PHASE 2 — Roadmap Generator")
    roadmap = call(base_url, "POST", "/roadmap/generate", {
        "user_id": user_id,
        "learner_profile": profile,
    })
    pretty("roadmap", roadmap)
    roadmap_id = roadmap["roadmap_id"]
    first_milestone = roadmap["milestones"][0]
    milestone_id = first_milestone["milestone_id"]
    topic_ids = [t["topic_id"] for t in first_milestone["topics"]][:2] or ["t1"]

    # ---------------- Phase 3: Session Tracker ----------------
    banner("PHASE 3 — Session Tracker (logging 2 study sessions)")
    for difficulty in ("medium", "hard"):
        session_log = call(base_url, "POST", "/sessions/log", {
            "user_id": user_id,
            "roadmap_id": roadmap_id,
            "topic_ids_covered": topic_ids,
            "duration_minutes": 45,
            "self_rated_difficulty": difficulty,
        })
        pretty(f"session log ({difficulty})", session_log)

    # ---------------- Phase 4: Adaptive Roadmap ----------------
    banner("PHASE 4 — Adaptive Roadmap Engine (simulating a weak quiz score)")
    adapt = call(base_url, "POST", "/roadmap/adapt", {
        "user_id": user_id,
        "roadmap_id": roadmap_id,
        "milestone_id": milestone_id,
        "quiz_id": "quiz-1",
        "score_percent": 35.0,
        "topic_breakdown": {tid: 35.0 for tid in topic_ids},
    })
    pretty("adaptive result", adapt)

    # ---------------- Phase 5: Intent Parser ----------------
    banner("PHASE 5 — Intent Parser")
    intent = call(base_url, "POST", "/intent/classify", {
        "user_id": user_id,
        "message": "this is really hard, I don't think I'm getting it",
    })
    pretty("classified intent", intent)

    # ---------------- Phase 6: Nudges ----------------
    banner("PHASE 6 — Motivation Detector / Nudges")
    nudge = call(base_url, "GET", f"/nudges/check/{user_id}")
    pretty("nudge check", nudge)

    # ---------------- Phase 7: Weekly Review ----------------
    banner("PHASE 7 — Weekly Review Generator")
    review = call(base_url, "POST", f"/reviews/weekly/{user_id}")
    pretty("weekly review", review)

    # ---------------- Phase 8: Feedback Loop ----------------
    banner("PHASE 8 — Feedback Loop / Eval Harness")
    feedback = call(base_url, "POST", "/feedback/event", {
        "user_id": user_id,
        "event_type": "roadmap_change_accepted" if adapt.get("changed") else "nudge_shown",
        "reference_id": roadmap_id,
        "outcome_note": "demo run via full_flow_demo.py",
    })
    pretty("feedback logged", feedback)
    summary = call(base_url, "GET", f"/feedback/summary?user_id={user_id}")
    pretty("feedback summary", summary)

    banner("DONE — all 8 phases exercised for one learner")
    print(f"user_id={user_id}  roadmap_id={roadmap_id}  milestone_id={milestone_id}")
    print(f"health check: GET {base_url}/health")
    print(f"metrics:      GET {base_url}/metrics")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    run(args.base_url.rstrip("/"))
