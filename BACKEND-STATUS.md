# AI Mentor — Backend Status & Integration Handoff

**As of:** July 17, 2026
**Status:** Major architecture change this update — the AI layer now calls a real, separately-built `mentor_ai_engine` service instead of generating content itself. Read §2 before assuming anything from an earlier version of this doc still holds.

---

## 1. Architecture (updated)

```
Frontend (your team, in progress)
      ↓ HTTP + JWT
Node/Express backend (port 4000)   — auth, persistence, scheduling, notifications
      ↓                                    ↓
mentor_ai_engine (external, real URL)   mentor-brain / FastAPI (port 8000)
  — interview, roadmap, adapt,             — NOW TTS-ONLY: POST /tts/synthesize
    session tracking, nudges,                (ElevenLabs). Its old generation
    weekly reviews, feedback/eval              logic (Gemini) is unused but
                                                left in place, not deleted.
      ↓
Postgres (port 5432)
```

**What changed:** a teammate built `mentor_ai_engine`, a more complete AI service (8 phases: interview/goal-understanding, roadmap generation, session tracking, adaptive roadmap rewrites, intent parsing, nudges, weekly reviews, feedback/eval harness). The Node backend now calls that instead of `mentor-brain`'s own Gemini logic. `mentor-brain` still exists, but only for ElevenLabs text-to-speech — decoupled from any text generation.

**Important flow change:** the interview is now **interview-first**. You no longer create a `LearnerProfile` before starting an interview — starting an interview needs nothing. The interview conversation itself builds the profile, which comes back as the payload on the turn where the interview completes. The backend persists that returned profile automatically. The old manual `PUT /api/profile` flow still exists and still works (e.g. for editing an existing profile), but it's no longer a prerequisite for interviews or roadmaps.

---

## 2. What's verified vs. assumed in this update

Be more careful with this section than usual — this update was built from a teammate's client code + integration notes, not from a live connection to `mentor_ai_engine` itself.

| Area | Status |
|---|---|
| `mentorEngineClient.ts` wiring into real routes/services/schema | ✅ Written, field names cross-checked against `schema.prisma` by hand |
| `mentor-brain` TTS-only endpoint (`POST /tts/synthesize`) | ✅ Built and tested (18 automated tests) |
| Full `tsc` type-check with real generated Prisma types | ❌ Not possible in this environment (see §6) — needs to be run for real before trusting it |
| Any live call to `mentor_ai_engine` | ❌ Never made — no URL, no network access to it available here |
| Everything from the previous update (Gemini direct, ElevenLabs direct, Docker fixes, real Postgres/auth flow) | ✅ Still verified as before — see git history / earlier version of this doc if needed |

**Bottom line: this integration is written and internally consistent, but has not been run once against the real `mentor_ai_engine`.** Treat it the same way the original 6-phase build was flagged before anyone actually ran `npm install` for the first time — plausible-looking code isn't proof.

---

## 3. Running it

```bash
cd backend
cp .env.example .env
# Set ENGINE_BASE_URL to the real mentor_ai_engine URL
cp ../mentor-brain/.env.example ../mentor-brain/.env
npm install
npx prisma migrate dev   # new migration needed — new columns (see §5)
docker-compose up -d --build
```

---

## 4. API surface (updated)

Same auth pattern as before (`Authorization: Bearer <JWT>`). Changes from the previous version of this doc:

| Route | Methods | Notes |
|---|---|---|
| `/api/interview` | POST (start) | **No body needed anymore** — starting an interview no longer requires an existing profile |
| `/api/interview/:sessionId/respond` | POST | On the turn where the interview completes, response includes `isComplete: true` and the profile the engine built is auto-saved |
| `/api/roadmap` | POST (generate) | Requires a profile to exist (from either the interview or a manual `PUT /api/profile`) |
| `/api/roadmap/:roadmapId/adapt` | PATCH | **New.** Body: `{ milestoneId, quizId, scorePercent, topicBreakdown? }` — call after a checkpoint quiz |
| `/api/feedback/event` | POST | **New.** Body: `{ eventType, referenceId, outcomeNote? }`. `eventType` is one of `nudge_shown`, `nudge_followed`, `nudge_ignored`, `roadmap_change_accepted`, `roadmap_change_reverted` |
| `/api/feedback/summary` | GET | **New.** Self-only eval-harness summary (not part of the frozen contract, internal/ops-flavored, but stable) |
| `/api/sessions` (POST) | — | Body now optionally accepts `roadmapId` — send it if you want this session to also feed the engine's mastery tracking, not just the local log |

`questionAudioBase64` still works exactly as before on both interview endpoints — unaffected by this change.

---

## 5. Database changes (new migration needed)

- `InterviewSession.engineSessionId` — tracks the engine's own session id, needed to continue a conversation
- `Roadmap.engineRoadmapId`, `Roadmap.generatedFromProfileVersion` — `engineRoadmapId` specifically is required before `/adapt` will work on a given roadmap
- `NudgeLog.suggestedAction` — new optional field from the engine's richer nudge response
- New table `EngineFeedbackEvent` — deliberately separate from the existing `FeedbackEvent` table, which is a different concept (weekly-review summaries, not discrete UI events)

Run `npx prisma migrate dev` to generate and apply this migration — hasn't been run yet anywhere real.

---

## 6. Known gaps

1. **Never tested against the real `mentor_ai_engine`** — the single biggest risk right now, same category of risk the original FastAPI contract was in before anyone ran it live.
2. **Full `tsc` type-check blocked** in this sandbox — `npx prisma generate` can't reach `binaries.prisma.sh` here. Your Docker build has successfully run `prisma generate` before, so this should resolve there; if it doesn't, that's a new problem worth flagging back.
3. **`classifyIntent()` (Phase 5, intent parsing) is in `mentorEngineClient.ts` but not wired into any route** — there wasn't an obvious existing integration point (no generic "chat message" endpoint outside the interview flow) without inventing new product behavior, so it's available but unused. Flag if you want it wired somewhere specific.
4. **`getRoadmapDebug()` and the engine's in-memory roadmap store are explicitly not the source of truth** — the client's own docstring warns about this; Postgres via the backend is what should be read from.
5. Everything listed as a gap in the previous version of this doc (Render deployment, no Node test suite, ElevenLabs free-tier quota) is still a gap — unaffected by this change.

---

## 7. For the frontend team specifically

- Interview: don't send a profile to start it anymore. Watch for `isComplete: true` on the respond endpoint — that's your signal the interview finished and a profile now exists.
- Roadmap adapt: call `PATCH /api/roadmap/:roadmapId/adapt` after a checkpoint quiz, not the old `/progress` endpoint (that one's still there for manual progress updates, but `/adapt` is the AI-driven rewrite).
- Session logs: include `roadmapId` in the body going forward if you want mastery scores to update from that session.
- New feedback endpoints are available if product wants to track nudge/roadmap-change outcomes explicitly (e.g. "did the user actually follow this nudge").
