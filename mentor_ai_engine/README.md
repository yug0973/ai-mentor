# Mentor AI Engine

Decision-making engine for the AI Mentor project.
Owner: AI Engineer / Technical Lead.
Scope: goal understanding → intent parsing → roadmap generation → adaptive roadmap →
smart nudges → weekly review → feedback loop.

This service does **not** handle auth, persistence, UI, or deployment — those are
owned by the backend/frontend/infra team members. This is a standalone FastAPI
service they call over REST.

---

## Status

| Phase | Module                          | Status              |
|-------|----------------------------------|---------------------|
| 1     | Goal Understanding (interview)  | ✅ Live (real LLM)   |
| 2     | Roadmap Generator               | ✅ Live (real LLM, two-pass) |
| 3     | Session Tracker / Memory Layer  | ✅ Live (deterministic, no LLM) |
| 4     | Adaptive Roadmap Engine         | ✅ Live (rule-based + targeted LLM) |
| 5     | Intent Parser (router)          | ✅ Live (fast-path rules + fast-tier LLM) |
| 6     | Motivation Detector / Nudges    | ✅ Live (rule-based signals + targeted LLM copy) |
| 7     | Weekly Review Generator         | ✅ Live (rule-based aggregation + targeted LLM copy) |
| 8     | Feedback Loop / Eval Harness    | ✅ Live (real storage + aggregation) |

**Every endpoint above is live and callable right now**, all returning real
AI-driven output — the schema was frozen from the start (see
`API_CONTRACT.md`), so backend/frontend have been building the entire app
against these endpoints in parallel the whole time. Phases 2, 4, 5, 6, and 7
now return real output unless `MOCK_LLM=true`, in which case those phases
fall back to their original fixed mock data (Phase 3 has no LLM dependency
at all, so it always runs for real — see "What Phase 3 does" below). Phase 4
also degrades to mock output at runtime if it's asked to adapt a
`roadmap_id` this process never generated — see "What Phase 4 does" below.

## Working in parallel (read this first)

Set `MOCK_LLM=true` in `.env` and you don't need a Gemini API key at all —
even Phase 1's interview runs on a scripted flow with zero network calls.
Every other phase is already mock-driven by default. This means:

- **Frontend** can build the full onboarding chat, roadmap screen, session
  logger, nudge banner, weekly review screen, and feedback buttons — today,
  offline, with zero setup beyond `pip install` + `uvicorn`.
- **Backend** can build the full DB schema, gateway routes, and scheduled
  jobs (nudge check, weekly review) against real response shapes — today.

As each phase is actually implemented, only the internal router logic
changes — paths and schemas stay identical, so nothing you build breaks.

See `API_CONTRACT.md` for the full frozen schema reference, and
`openapi.json` for the machine-readable spec (importable into Postman).

---

## What Phase 1 does

A fully LLM-driven conversational intake interview. The learner talks to the
mentor naturally; the model decides what to ask next and when it has enough
information. When done, it outputs a structured `LearnerProfile` JSON — this
is the handoff contract into Phase 2 (Roadmap Generator).

Domain is scoped to **tech/coding only** (web dev, DSA, ML, mobile, backend,
devops, etc.) — this keeps prompts reliable and avoids generic
subject-detection sprawl.

---

## Setup

```bash
cd mentor_ai_engine
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and add a Gemini API key: https://aistudio.google.com/
```

Run it:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: `http://localhost:8000/docs`

### Or with Docker (recommended for backend team)

```bash
cp .env.example .env   # set MOCK_LLM=true if you don't want to add a real key yet
docker compose up --build
```

Service comes up on `http://localhost:8000`. Backend team: add your own
service as a sibling container in `docker-compose.yml` (template included)
and call this one at `http://mentor-ai-engine:8000` from inside the compose network.

### Fully offline alternative (zero API key)

If you'd rather not depend on any external API at all, install
[Ollama](https://ollama.com), pull a model (`ollama pull llama3.1`), then in
`.env` set:

```
LLM_API_KEY=ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
```

No other code changes needed — the LLM client is provider-agnostic.

---

## API Contract (for backend/frontend integration)

### `POST /interview/start`
Starts a new interview session.

**Response**
```json
{
  "session_id": "uuid",
  "mentor_message": "Hey! I'm going to build you a personalized learning roadmap...",
  "status": "in_progress"
}
```

### `POST /interview/message`
Send the learner's reply.

**Request**
```json
{ "session_id": "uuid", "message": "I want to become job-ready in backend dev in 3 months" }
```

**Response — mid-interview**
```json
{ "session_id": "uuid", "status": "in_progress", "mentor_message": "Got it — what's your current experience with backend concepts...?" }
```

**Response — interview complete**
```json
{
  "session_id": "uuid",
  "status": "complete",
  "learner_profile": {
    "goal": "job-ready in backend dev",
    "domain": "backend",
    "current_level": "beginner",
    "timeline_weeks": 12,
    "hours_per_week": 8,
    "known_skills": ["python-basic"],
    "weak_areas": [],
    "preferred_learning_style": "project-based",
    "motivation_type": "career-switch",
    "constraints": ["works full-time"]
  }
}
```

### `GET /interview/{session_id}`
Poll current state (useful if the frontend needs to resume after a refresh).

---

## Design notes / why it's built this way

- **In-memory session store** (`app/storage.py`) — fine for local dev and demo.
  Before production, swap for Redis or a DB table keyed by `session_id`. This
  is intentionally isolated behind `SessionStore` so that swap is a one-file change.
- **Provider-agnostic LLM client** (`app/llm_client.py`) — Gemini today, but
  switching to OpenAI, Groq, local Ollama, or (later) Claude is a `.env` change only.
- **Structured output via delimiter parsing, not native JSON mode** — the
  current provider doesn't have Claude/OpenAI-grade guaranteed JSON schema
  enforcement, so the prompt asks for a `<PROFILE_COMPLETE>...</PROFILE_COMPLETE>`
  block, parsed with a regex + Pydantic validation. Malformed output is logged
  and treated as "still in progress" rather than crashing the session.
- **Hard turn cap (`MAX_TURNS = 10`)** — prevents a model from looping forever
  without finishing the interview; forces completion with best-effort field
  estimates past that point.
- **Prompts are versioned** (`PROMPT_VERSION` in `app/interview/prompts.py`) —
  bump this whenever wording changes so you can A/B or regression-test.

---

## What Phase 2 does

`POST /roadmap/generate` takes a `LearnerProfile` (Phase 1's output) and
produces a milestone/topic DAG via **two-pass generation**:

1. **Pass 1** — one LLM call produces a coarse milestone sequence (3-6
   milestones) for the whole goal, taking `current_level` and `timeline_weeks`
   into account.
2. **Pass 2** — one LLM call per milestone expands it into concrete topics
   (title, description, `estimated_hours`, `prerequisites`), aware of topic
   titles already generated in earlier milestones so it can reference them.

`topic_id` / `milestone_id` assignment happens in code, not the model — the
model only ever refers to prerequisites by exact topic title text, which is
mapped to real ids after generation. Any hallucinated/forward-referencing
prerequisite title is silently dropped rather than crashing generation, so
the DAG is always valid. Topics matching an entry in `known_skills` are
marked `status: "completed"` automatically. Generation is scoped to the
tech skill taxonomy in `app/roadmap/taxonomy.py`.

If real generation fails to produce parseable output after one corrective
retry per pass (bad LLM output, provider error, etc.), the endpoint degrades
to the original fixed mock roadmap rather than returning a 500 — see
`app/routers/roadmap.py`.

See `app/roadmap/` for the implementation (`prompts.py`, `taxonomy.py`,
`generator.py`) — structured the same way as `app/interview/` was for Phase 1.

Offline test (monkeypatches the LLM client with canned two-pass responses,
since Groq isn't reachable from every sandboxed dev environment):

```bash
python tests/test_roadmap_offline.py
```

## What Phase 3 does

`POST /sessions/log` takes a logged study session and updates per-topic
mastery scores using a deterministic **exponential-approach model**
(`app/memory/mastery.py`, `MASTERY_MODEL_VERSION`) — no LLM call, no API key
dependency:

- Session time is split evenly across `topic_ids_covered` (the request
  schema doesn't collect a per-topic breakdown).
- Each session closes a fraction of the remaining gap to full mastery
  (`1.0`), so gains naturally diminish as a topic's score climbs — a 30-min
  session at `mastery=0.1` moves the needle more than the same session at
  `mastery=0.9`.
- `self_rated_difficulty` scales the effective learning rate: `easy` > `medium`
  > `hard` (struggling still counts as progress, just less of it).

Session history and mastery are kept in an in-memory `MemoryStore`
(`app/memory/store.py`) — same "swap for Redis/DB before production" caveat
as `SessionStore` in `app/storage.py`. It intentionally retains more than the
`SessionLogResponse` schema needs (full session records, not just current
scores) because Phase 6 (Nudges) will need "days since last session" and
Phase 7 (Weekly Review) will need session counts/hours over a date range —
both should read from this same store rather than duplicating session
storage later.

Test: `python tests/test_sessions_offline.py` — covers the mastery curve
(monotonic increase, diminishing returns, ceiling at 1.0), difficulty
modifier direction, multi-topic time-splitting, empty-topic edge case, and
per-user isolation.

## Observability

`GET /metrics` (not part of the frozen phase contract — an internal debug
endpoint) returns in-memory event counters from `app/metrics.py`. Every
phase records events here (e.g. `roadmap_generated`, `roadmap_generation_fallback`,
`session_logged`) as structured JSON log lines plus counters, so degraded
behavior (like Phase 2 silently falling back to mock roadmaps due to Groq
flakiness) is visible without needing an external metrics backend.

## What Phase 4 does

`POST /roadmap/adapt` takes a `QuizResult` (a checkpoint quiz score for one
milestone, optionally broken down per topic) and decides whether/how to
rewrite that milestone — combining deterministic rule-based logic
(`app/adaptive/rules.py`) with a **targeted LLM rewrite scoped to just the
affected milestone's remediation topics**, not a full roadmap regeneration:

1. **Weak-topic detection is rule-based, not LLM-based.** For every topic in
   the quizzed milestone, a per-topic quiz score (from `topic_breakdown`, or
   the overall `score_percent` if that topic wasn't broken out) is combined
   with the topic's current mastery score from the Phase 3 memory layer
   (`app/memory/store.py`) into a single weakness score. Quiz result is
   weighted more heavily than mastery (`QUIZ_WEIGHT` / `MASTERY_WEIGHT` in
   `app/adaptive/rules.py`) since it's the more immediate signal, but a
   topic with strong prior mastery won't get flagged over one unlucky quiz.
2. **Weak topics get a remediation topic inserted ahead of them** — one
   targeted LLM call generates title/description/estimated_hours for all of
   a milestone's flagged topics at once (`app/adaptive/prompts.py`,
   `app/adaptive/engine.py`). The original topic's prerequisites are rewired
   to depend on its new remediation topic, its own `estimated_hours` is
   bumped, and it's relocked pending that remediation — regardless of what
   its status was before. If the LLM call fails to produce parseable output
   after one corrective retry (matching Phase 2's tolerance), remediation
   still gets inserted with deterministic templated copy rather than
   dropping the decision — see `_generate_remediation`'s fallback.
3. **A passing milestone score marks its non-weak topics `completed`,**
   which can cascade: a fixed-point pass (`_propagate_unlocks`) walks the
   *whole* roadmap and flips any `locked` topic to `available` once every one
   of its prerequisites is `completed` — so passing milestone N can unlock
   topics in milestone N+1, even ones this specific `/adapt` call didn't
   touch directly.
4. `updated_roadmap.progress_percent` is recomputed as
   `completed topics / total topics` across the whole roadmap.

**Roadmap lookup:** `QuizResult`'s schema (frozen, see `API_CONTRACT.md`)
only carries a `roadmap_id`, not the roadmap itself — long-term persistence
is backend's job, not this service's. So `/roadmap/generate` now also saves
its output into a new in-memory `app/roadmap/store.py` (same pattern as
`SessionStore`/`MemoryStore`), and `/roadmap/adapt` reads/writes through
that store by `roadmap_id`. If a `roadmap_id` isn't found there — different
process, a restart, or a roadmap backend persisted some other way without
ever calling `/roadmap/generate` on this service — `/roadmap/adapt` degrades
to mock output instead of 404ing on backend's quiz-submission flow, same
"log and don't crash" pattern as Phase 2. A debug `GET /roadmap/{roadmap_id}`
was also added (like `GET /metrics`, not part of the frozen contract) to
inspect a roadmap's current state directly.

Test: `python tests/test_adaptive_offline.py` — covers weak-topic detection
combining quiz + mastery, remediation insertion and prerequisite rewiring,
milestone-pass completion cascading into downstream unlocks, the
not-found-in-store fallback, unknown `milestone_id` fallback, `MOCK_LLM=true`
mode, and the deterministic fallback when the LLM returns unparseable output.

## What Phase 5 does

`POST /intent/classify` takes a learner's free-text message and classifies
it into one of the six fixed intents (`asking_question`, `reporting_progress`,
`expressing_frustration`, `requesting_change`, `off_topic`, `quiz_response`)
so the backend/frontend chat layer knows how to route it — e.g. surfacing
frustration to a nudge, or routing a quiz-style reply into the Phase 4
pipeline instead of general chat. This fires on **every** learner message
during ongoing conversation, so it's built for low latency/cost, cheapest
option first:

1. **Fast path — no LLM call at all** (`app/intent/rules.py`): an empty
   message classifies straight to `off_topic`, and a bare quiz-option reply
   (`"A"`, `"3"`, `"b)"`, etc.) classifies straight to `quiz_response`. Both
   are unambiguous enough that paying for a model round trip on them would
   be pure waste.
2. **Everything else goes to one small/fast-tier LLM call**
   (`app/intent/classifier.py`, `app/intent/prompts.py`) — deliberately a
   smaller Groq model (`settings.INTENT_LLM_MODEL`, defaults to
   `llama-3.1-8b-instant`) than the one used for interview/roadmap/adaptive
   generation, since this is a routing classifier, not a conversational
   responder. `app/llm_client.py`'s `chat()` now takes an optional `model`
   override per-call so the rest of the codebase can keep using one shared
   `LLMClient` instance instead of standing up a second client.
3. **Deterministic keyword fallback** (`app/intent/rules.py`) if the LLM
   never returns a parseable `<INTENT_RESULT>` block after one corrective
   retry (same tolerance as Phases 2 and 4) — the router still needs to
   return *something* rather than 500ing on backend's chat flow. This
   fallback classification is flagged with a low `confidence` (0.4) so
   callers can tell it apart from a real model classification.

`MOCK_LLM=true` still returns the original naive keyword-based mock
(`app/mock_data.py`), unchanged, per the Phase 1 handoff's constraint #4.

Test: `python tests/test_intent_offline.py` — covers both fast-path
shortcuts, a real (monkeypatched) LLM classification, a fenced-JSON reply
still parsing correctly, the deterministic fallback when the LLM never
returns parseable output, and `MOCK_LLM=true` mode.

## What Phase 6 does

`GET /nudges/check/{user_id}` reads the learner's Phase 3 session history
and mastery scores (`app/memory/store.py`) and decides whether a
motivational nudge should fire — same "rule decides, LLM only writes copy"
split as Phase 4:

1. **Signal detection is entirely rule-based** (`app/nudges/rules.py`), in
   priority order (most urgent wins if more than one fires):
   - **Long inactivity** (≥7 days since last session) → `check_in`
   - **Inactivity** (≥3 days since last session) → `offer_lighter_session`
   - **Struggling** — of the last 3 sessions, either ≥60% were self-rated
     `"hard"`, or the average Phase 3 mastery score across topics those
     sessions covered is below 0.35 → `offer_lighter_session`
   - **Frequency drop** — session count in the trailing 7 days has fallen
     to ≤50% of the 7 days before that (guarded by a minimum previous-window
     count so a light week 1 doesn't misread as a "drop") → `check_in`
   - A user with **no session history at all** gets `nudge_triggered=false`
     with `trigger_reason="no_session_history"` — there's no history yet to
     detect a *drop* against. A user tripping none of the above gets
     `trigger_reason="on_track"`.
2. **The nudge_message text is LLM-authored, but only when a nudge actually
   fires** (`app/nudges/engine.py`, `app/nudges/prompts.py`) — if the rules
   decide not to nudge, there's nothing to write copy for, so no LLM call
   happens at all (same cost-consciousness as Phase 5's fast path). The
   prompt is given the trigger_reason and short context (days inactive, or
   which topics — looked up by title via `app/roadmap/store.py` when
   available — the learner's been struggling with) and told to match tone
   to the reason, using the same mentor persona as Phase 1's interview.
3. If the LLM never returns a parseable `<NUDGE_MESSAGE>` block after one
   corrective retry, a deterministic templated message for that
   trigger_reason is used instead (`FALLBACK_MESSAGES` in
   `app/nudges/engine.py`) — same "the rule layer's decision must not be
   dropped over an LLM hiccup" principle as Phase 4's remediation fallback.

`MOCK_LLM=true` still returns the original fixed mock nudge, unchanged, per
the Phase 1 handoff's constraint #4.

Test: `python tests/test_nudges_offline.py` — covers no-session-history,
long/short inactivity, struggling, frequency drop, the deterministic
fallback when the LLM never returns parseable output, and `MOCK_LLM=true`
mode. Session timestamps are backdated on the in-memory store after logging
through the real `/sessions/log` endpoint, so the rule layer is exercised
against realistic session records rather than hand-built ones.

## What Phase 7 does

`POST /reviews/weekly/{user_id}` summarizes a learner's Phase 3 session
history over the trailing 7 days into a short recap, called by backend's
scheduled weekly job. Same "rule decides the facts, LLM only writes copy"
split as Phases 4 and 6:

1. **All the numbers and topic lists are entirely rule-based**
   (`app/reviews/rules.py`), reading Phase 3's session/mastery data:
   - `sessions_completed` / `total_hours` — count and sum over sessions
     logged in the last 7 days.
   - `topics_improved` vs. `topics_stagnant` — for every topic touched this
     week, its mastery score is replayed from the user's *full* session
     history (using the same formula as `app/memory/mastery.py`) to recover
     the score just before the window began, then compared against its
     current score. A delta at or above a small threshold counts as
     improved; anything smaller (a run of "hard" sessions, or a topic
     already near the mastery ceiling) counts as stagnant.
   - `goal_progress_percent` — read from this service's roadmap copy
     (`app/roadmap/store.py`) via the `roadmap_id` on the user's most recent
     session, same lookup pattern as Phase 6's topic-title enrichment.
   - a `focus_topic` is picked for next week — preferring a stagnant topic
     (time was already spent there) over an untouched one.
2. **`next_week_focus` and `motivational_insight` are LLM-authored**
   (`app/reviews/engine.py`, `app/reviews/prompts.py`) from those
   already-computed facts — the LLM is never asked to compute or invent a
   number, only to phrase two short lines around them.
3. **Deterministic fallback text per field** if the LLM never returns both
   parseable blocks after one retry — same "the rule layer's facts must not
   be dropped over an LLM hiccup" principle as Phase 6's nudge fallback.
4. A learner with **zero session history at all** gets a fully
   deterministic "get started" response (`sessions_completed: 0`, empty
   topic lists, a generic first-session nudge) with **no LLM call** — same
   cost-consciousness as Phase 6's `no_session_history` case. A learner with
   history but no sessions in the last 7 days ("quiet week") still gets an
   LLM-authored message, since there's real history worth referencing.

`MOCK_LLM=true` still returns the original fixed mock review, unchanged.

Test: `python tests/test_reviews_offline.py` — covers zero-history (no LLM
call), a topic that clearly improves, a topic pushed to the mastery ceiling
before the window so an in-window session on it reads as stagnant, a quiet
week, the deterministic fallback, and `MOCK_LLM=true` mode.

## What Phase 8 does

Closes the loop on whether Phase 6's nudges and Phase 4's adaptive roadmap
changes actually help, by turning the original print-only stub into real
storage + aggregation. No LLM involved anywhere in this phase — it's pure
storage and arithmetic, so it always runs "for real" regardless of
`MOCK_LLM` (same as Phase 3).

1. **`POST /feedback/event`** — path and schema unchanged from the stub
   (frozen per `API_CONTRACT.md`). Events are now persisted in-memory
   (`app/feedback/store.py`) instead of just printed.
2. **`GET /feedback/summary`** (optional `?user_id=`) — a **new**,
   deliberately non-frozen endpoint (same internal-ops carve-out as
   `GET /metrics`) exposing the eval harness aggregation
   (`app/feedback/eval.py`): total events, a per-type breakdown,
   `nudge_follow_through_rate` (followed vs. ignored), and
   `roadmap_change_acceptance_rate` (accepted vs. reverted). A rate is
   `null` rather than `0.0` when there's no data yet for it, so "no data"
   and "0% rate" aren't confused.
3. **Known limitation, flagged rather than silently worked around:** the
   frozen `FeedbackEventRequest` schema only carries a `reference_id`, not
   the nudge `trigger_reason` or adaptive change type that produced it — so
   today's harness reports overall rates, not a breakdown by *which* nudge
   reason or prompt version performs best. Closing that gap would mean
   adding a field to the request schema, which is a breaking change for
   backend/frontend to weigh in on, not something to quietly infer around.

Test: `python tests/test_feedback_offline.py` — covers logging, the
no-data-yet `null`-rate case, both ratio calculations, per-user isolation,
the global (all-users) summary, and the health check.

## Project status

All 8 phases are now live. Original scope (goal understanding → intent
parsing → roadmap generation → adaptive roadmap → smart nudges → weekly
review → feedback loop) is complete end-to-end.
