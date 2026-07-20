# API Contract — Mentor AI Engine

**This document is the source of truth for integration.** Every endpoint below
is schema-frozen — request/response shapes won't change, even as I replace
mock logic with real logic phase by phase. Build against this now; nothing
breaks later.

Full machine-readable spec: `openapi.json` (import into Postman, or generate
typed clients with `openapi-typescript`, `openapi-generator`, etc.). Also
browsable live at `http://localhost:8000/docs` once the service is running.

---

## How to work in parallel without conflicts

1. Run the service locally with `MOCK_LLM=true` in `.env` — **no API key needed at all.**
   Every endpoint returns realistic, correctly-shaped fake data.
2. Backend: build your DB schema, auth, and gateway routes against these
   exact response shapes.
3. Frontend: build every screen (onboarding chat, roadmap view, session
   logger, nudge banner, weekly review, feedback thumbs-up/down) against
   these exact shapes.
4. As I finish each phase for real, I swap only the internal router logic
   (e.g. `app/routers/roadmap.py`). **Endpoint paths, request fields, and
   response fields do not change.** Re-point your `.env`/base URL from mock
   to the deployed real service and everything keeps working.
5. `status` fields (`"stub"` vs `"live"`) are visible at `GET /health` if you
   want to programmatically check what's real yet.

---

## Endpoints

### Phase 1 — Goal Understanding (LIVE)
- `POST /interview/start` → `{session_id, mentor_message, status}`
- `POST /interview/message` → `{session_id, status, mentor_message?, learner_profile?}`
- `GET /interview/{session_id}` → same shape as above

### Phase 2 — Roadmap Generator (LIVE — real two-pass LLM generation, mock available via `MOCK_LLM=true`)
- `POST /roadmap/generate`
  Request: `{user_id, learner_profile}`
  Response: `Roadmap` — `{roadmap_id, user_id, goal, milestones[], progress_percent, generated_from_profile_version}`
  Each milestone: `{milestone_id, title, topics[], checkpoint_quiz_id}`
  Each topic: `{topic_id, title, description, estimated_hours, status, prerequisites[]}`

### Phase 3 — Session Tracker (LIVE — deterministic mastery model, no LLM/API key needed)
- `POST /sessions/log`
  Request: `{user_id, roadmap_id, topic_ids_covered[], duration_minutes, self_rated_difficulty?, notes?}`
  Response: `{logged, updated_mastery[]}` — each mastery entry: `{topic_id, mastery_score (0-1), last_updated}`

### Phase 4 — Adaptive Roadmap Engine (LIVE — rule-based weak-topic detection + targeted LLM remediation rewrite, mock available via `MOCK_LLM=true`)
- `POST /roadmap/adapt`
  Request (`QuizResult`): `{user_id, roadmap_id, milestone_id, quiz_id, score_percent, topic_breakdown{}}`
  Response: `{roadmap_id, changed, change_summary, updated_roadmap}`
  Note: looks the roadmap up by `roadmap_id` in this service's in-memory
  store (populated by `/roadmap/generate`); falls back to mock output if
  that id isn't found rather than 404ing. See README "What Phase 4 does".

### Phase 5 — Intent Parser (LIVE)
- `POST /intent/classify`
  Request: `{user_id, message}`
  Response: `{intent, confidence}` — intent is one of: `asking_question | reporting_progress | expressing_frustration | requesting_change | off_topic | quiz_response`
  Endpoint path and schema unchanged from the stub. Real mode: a fast
  deterministic shortcut for an empty message or a bare quiz-option reply
  (no LLM call), otherwise one call to a small/fast-tier LLM
  (`settings.INTENT_LLM_MODEL`). Falls back to a low-`confidence` (0.4)
  deterministic keyword guess — not a 404/500 — if the LLM never returns
  parseable output after one retry. `MOCK_LLM=true` still returns the
  original fixed keyword-based mock.

### Phase 6 — Motivation Detector / Nudges (LIVE)
- `GET /nudges/check/{user_id}`
  Response: `{nudge_triggered, nudge_message?, suggested_action?, trigger_reason?}`
  Intended caller: backend's scheduled job (cron), not the frontend directly.
  Endpoint path and schema unchanged from the stub. Real mode: deterministic
  rule-based signal detection (inactivity — two severity tiers, session-
  frequency drop, struggling on recently covered topics) reading Phase 3's
  session/mastery data; `trigger_reason` is one of `long_inactivity |
  inactivity | struggling | frequency_drop | no_session_history | on_track`.
  A targeted LLM call writes `nudge_message` only when a nudge actually
  fires; falls back to a fixed templated message per reason if the LLM
  never returns parseable output after one retry. `MOCK_LLM=true` still
  returns the original fixed mock nudge.

### Phase 7 — Weekly Review Generator (LIVE)
- `POST /reviews/weekly/{user_id}`
  Response: `{user_id, week_start, week_end, sessions_completed, total_hours, topics_improved[], topics_stagnant[], goal_progress_percent, next_week_focus, motivational_insight}`
  Intended caller: backend's scheduled weekly job.
  Endpoint path and schema unchanged from the stub. Real mode: deterministic
  aggregation over Phase 3's session/mastery data — sessions_completed and
  total_hours over the trailing 7 days, topics_improved vs. topics_stagnant
  (each touched topic's mastery score is replayed from full session history
  to compare its value before vs. after the window), and
  goal_progress_percent from this service's roadmap copy if available. A
  targeted LLM call writes `next_week_focus` and `motivational_insight` from
  those already-computed facts; falls back to fixed templated text if the
  LLM never returns both parseable blocks after one retry. A user with zero
  session history ever gets a fully deterministic "get started" response
  with no LLM call at all. `MOCK_LLM=true` still returns the original fixed
  mock review.

### Phase 8 — Feedback Loop / Eval Harness (LIVE)
- `POST /feedback/event`
  Request: `{user_id, event_type, reference_id, outcome_note?}`
  event_type: `nudge_shown | nudge_followed | nudge_ignored | roadmap_change_accepted | roadmap_change_reverted`
  Response: `{logged}`
  Endpoint path and schema unchanged from the stub. Real mode: events are
  now persisted in-memory (`app/feedback/store.py`) instead of just printed.
- `GET /feedback/summary` (optional `?user_id=`) — **not** part of the
  frozen contract above (same internal-ops carve-out as `GET /metrics`).
  Returns the eval harness's aggregation over stored events: `total_events`,
  `event_counts`, `nudge_follow_through_rate`, `roadmap_change_acceptance_rate`,
  `distinct_users`. Rates are `null` (not `0.0`) when there's no data yet.
  Known limitation: since `reference_id` is the only link back to a specific
  nudge/roadmap change, this can report overall rates but can't yet break
  them down by nudge `trigger_reason` or prompt version — see
  `app/feedback/eval.py` for the full note.

---

## Things that will NOT change once you build against them

- Endpoint paths and HTTP methods
- Field names and types in every request/response model (`app/models.py` is the single file defining all of this)
- The `status`/enum literal values (e.g. intent categories, difficulty levels)

## Things that WILL change (internal only, invisible to you)

- The actual content returned (mock → real generation)
- Response *latency* (mock is instant, real LLM calls take 1-4s — design loading states accordingly even now)
- Internal file structure under `app/routers/` and `app/mock_data.py`
