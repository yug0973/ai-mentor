# Testing Guide — Mentor AI Engine

Two layers of testing, cheapest first:

1. **Automated offline tests** — no API key, no network, no server running. Proves the logic is correct.
2. **Manual smoke test against the running server** — proves the whole FastAPI app wires together and the endpoints respond the way `API_CONTRACT.md` says they will, first in mock mode (zero cost) then against the real LLM.

Do both. The automated tests catch logic bugs; the manual pass catches wiring/integration bugs the unit-style tests can't see (routing, request validation, CORS, the actual JSON shape over the wire).

---

## 0. Setup

```bash
unzip mentor_ai_engine.zip
cd mentor_ai_engine
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Leave `.env` as-is for now (`MOCK_LLM` isn't set → defaults to `false`, but you don't need a key yet for step 1).

---

## 1. Automated offline tests (run this first)

Every phase has its own test file in `tests/`. They monkeypatch the LLM client with canned responses, so **no API key or network is needed** — they run against the real FastAPI app and real business logic, just with a fake model behind it.

Run them one at a time so a failure is easy to trace to a phase:

```bash
python tests/test_sessions_offline.py    # Phase 3 — no LLM at all, pure mastery math
python tests/test_roadmap_offline.py     # Phase 2
python tests/test_adaptive_offline.py    # Phase 4
python tests/test_intent_offline.py      # Phase 5
python tests/test_nudges_offline.py      # Phase 6
python tests/test_reviews_offline.py     # Phase 7
python tests/test_feedback_offline.py    # Phase 8 — no LLM at all, pure storage/aggregation
```

Or all at once and stop at the first failure:

```bash
for f in tests/test_*.py; do echo "== $f =="; python "$f" || break; done
```

Each script prints a `✅` line per test case and exits non-zero on any failure — good for wiring into CI later (a `pytest` wrapper would just need `assert`-style functions, which these already are).

**Expected output:** every line prefixed `✅`, ending in `All offline tests passed.` for each file. If one fails, the assertion message + traceback will point at the exact expectation that broke.

> **Phase 1 note:** there's no `test_interview_offline.py` — it predates this test-file convention. Test it manually in step 2 below, or via `MOCK_LLM=true`'s scripted flow (`app/interview/mock_interview.py`).

---

## 2. Manual smoke test — mock mode (zero cost, no key needed)

Set `MOCK_LLM=true` in `.env`, then start the server:

```bash
# .env
MOCK_LLM=true
```

```bash
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` — FastAPI's interactive Swagger UI. You can click "Try it out" on every endpoint from here instead of using curl, which is the fastest way to poke around.

Or from the command line:

```bash
# Overall health — confirms all 8 phases report "live" (or "functional_stub" pre-Phase-8)
curl -s http://localhost:8000/health | python3 -m json.tool
```

Expected:
```json
{
  "status": "ok",
  "phases": {
    "1_goal_understanding": "live",
    "2_roadmap_generator": "live",
    "3_session_tracker": "live",
    "4_adaptive_roadmap": "live",
    "5_intent_parser": "live",
    "6_nudges": "live",
    "7_weekly_review": "live",
    "8_feedback_loop": "live"
  }
}
```

Now walk one fake learner through every phase (mock mode returns fixed canned data, so responses won't vary, but this proves every route is reachable and schema-valid):

```bash
# Phase 1 — start + answer the scripted interview
curl -s -X POST http://localhost:8000/interview/start | python3 -m json.tool
# take the session_id from the response, then:
curl -s -X POST http://localhost:8000/interview/message \
  -H "Content-Type: application/json" \
  -d '{"session_id": "PASTE_SESSION_ID", "message": "I want to become job-ready in backend dev"}' \
  | python3 -m json.tool

# Phase 2 — roadmap (mock ignores the body's content in mock mode, but needs the shape)
curl -s -X POST http://localhost:8000/roadmap/generate \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo", "learner_profile": {"goal":"job-ready backend dev","domain":"backend","current_level":"beginner","timeline_weeks":12,"hours_per_week":10}}' \
  | python3 -m json.tool

# Phase 3 — log a session (always real, no MOCK_LLM gating)
curl -s -X POST http://localhost:8000/sessions/log \
  -H "Content-Type: application/json" \
  -d '{"user_id":"demo","roadmap_id":"r1","topic_ids_covered":["t1"],"duration_minutes":30,"self_rated_difficulty":"medium"}' \
  | python3 -m json.tool

# Phase 4 — adaptive roadmap
curl -s -X POST http://localhost:8000/roadmap/adapt \
  -H "Content-Type: application/json" \
  -d '{"user_id":"demo","roadmap_id":"r1","milestone_id":"m1","quiz_id":"q1","score_percent":40,"topic_breakdown":{"t1":40}}' \
  | python3 -m json.tool

# Phase 5 — intent
curl -s -X POST http://localhost:8000/intent/classify \
  -H "Content-Type: application/json" \
  -d '{"user_id":"demo","message":"this is really hard, can we slow down?"}' \
  | python3 -m json.tool

# Phase 6 — nudge check
curl -s http://localhost:8000/nudges/check/demo | python3 -m json.tool

# Phase 7 — weekly review
curl -s -X POST http://localhost:8000/reviews/weekly/demo | python3 -m json.tool

# Phase 8 — feedback event + summary
curl -s -X POST http://localhost:8000/feedback/event \
  -H "Content-Type: application/json" \
  -d '{"user_id":"demo","event_type":"nudge_followed","reference_id":"n1"}' \
  | python3 -m json.tool
curl -s http://localhost:8000/feedback/summary | python3 -m json.tool
```

**What to look for:** every call returns HTTP 200 with a body matching the shape in `API_CONTRACT.md`, and any text field literally contains `"MOCK: ..."` — that's expected in mock mode, it confirms you're hitting the mock path and not accidentally calling a real (and possibly missing) API key.

---

## 3. Manual smoke test — real mode (needs a free Groq key)

1. Get a free key: https://console.groq.com/keys
2. In `.env`:
   ```
   MOCK_LLM=false
   LLM_API_KEY=your_actual_key_here
   ```
3. Restart the server (`uvicorn` picks up `.env` changes on restart, not on `--reload` alone).
4. Re-run the same `curl` sequence from step 2, in order, **reusing the real `roadmap_id`, `topic_ids_covered`, etc. that come back from each response** rather than the placeholder values above — Phases 4, 6, and 7 read from the in-memory roadmap/session stores keyed by the IDs you actually generated, so chaining real IDs is what exercises the real cross-phase logic (e.g. Phase 4 needs a `roadmap_id` this same process generated via `/roadmap/generate`, or it silently degrades to mock output — see `README.md`, "What Phase 4 does").

**What to look for this time:**
- No `"MOCK: ..."` text anywhere — every free-text field (mentor messages, roadmap topic descriptions, nudge messages, weekly insight) should read as naturally generated, and will differ slightly if you re-run the same request.
- `GET /metrics` after a few calls should show real counters incrementing (`session_logged`, `nudge_checked`, `weekly_review_generated`, `feedback_logged`, etc.) — a quick way to confirm you're on the real path, not silently mocked:
  ```bash
  curl -s http://localhost:8000/metrics | python3 -m json.tool
  ```
- Watch the `uvicorn` terminal output — real-mode fallback paths (e.g. Phase 4/6/7's "LLM didn't return parseable output, retrying / falling back") print a `[phase] Failed to parse ...` line. Seeing one occasionally is fine (that's the safety net working); seeing it on *every* call suggests something's off with the model or prompt.

---

## 4. Regression-check after any code change

If you or I touch any phase's code later, re-run **all** the offline tests (step 1) before assuming nothing broke — several phases share the same underlying stores (`app/memory/store.py`, `app/roadmap/store.py`), so a change in one can silently affect another. The full loop:

```bash
for f in tests/test_*.py; do echo "== $f =="; python "$f" || break; done
curl -s http://localhost:8000/health | python3 -m json.tool   # server still boots, all phases still "live"
```
