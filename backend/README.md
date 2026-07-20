# AI Mentor — Backend (Phase 1–5)

Node.js + Express + TypeScript backend. Owns authentication, database,
API gateway to the FastAPI "Mentor Brain" service, scheduled jobs, and
notifications. Phase 1: setup + JWT auth. Phase 2: gateway APIs.
Phase 3: persistence gaps closed (indexes, list endpoints). Phase 4:
scheduled jobs (daily nudges, weekly reviews). Phase 5: real email +
push notification delivery.

## What's included in Phase 1

- Express + TypeScript project scaffold
- PostgreSQL connection via Prisma
- `User` model (bcrypt-hashed passwords)
- JWT auth: `POST /api/auth/register`, `POST /api/auth/login`,
  `GET /api/auth/me`, `POST /api/auth/logout`
- Middleware: JWT auth guard, Zod request validation, centralized error
  handling, request logging (pino)
- Docker + Docker Compose (Postgres + backend)
- Health check: `GET /health`

## What's included in Phase 2

All routes below require `Authorization: Bearer <token>`.

**Profile** (`/api/profile`) — pure CRUD, no AI call:
- `PUT /` — create or update the caller's learner profile
- `GET /` — fetch the caller's learner profile

**Interview** (`/api/interview`) — calls FastAPI, persists conversation state:
- `POST /` — start a new interview session (reads the learner profile,
  calls FastAPI `/interview/start`, saves the session)
- `GET /` — list the caller's interview sessions
- `POST /:sessionId/respond` — send the learner's next message (calls
  FastAPI `/interview/respond`, updates the saved session)
- `GET /:sessionId` — fetch a session's current state

**Roadmap** (`/api/roadmap`) — calls FastAPI, persists the result:
- `POST /` — generate a roadmap (calls FastAPI `/roadmap/generate`, saves it)
- `GET /` — list the caller's roadmaps
- `GET /:roadmapId` — fetch one roadmap
- `PATCH /:roadmapId/progress` — update `progressPercent`

**Study Sessions** (`/api/sessions`) — pure CRUD, no AI call:
- `POST /` — log a completed study session
- `GET /` — list the caller's session logs
- `GET /:sessionLogId` — fetch one log

## Phase 3 — Persist everything into PostgreSQL

The role guide lists this as its own phase, but in practice it's woven
into every Phase 2 endpoint rather than being a separate pass: each
gateway route calls FastAPI and writes the result to Postgres inside
the same request (see the "calls FastAPI, persists..." endpoints
above). What Phase 3 actually added on top of that:

- **`GET /api/interview`** — was missing; every other resource
  (profile, roadmap, sessions) had a list/fetch path, interview didn't.
- **`@@index([userId])`** on `InterviewSession`, `Roadmap`, and
  `SessionLog` — every list/lookup query filters by `userId`, so these
  are the indexes that matter for query performance as data grows.

Nothing else was missing: profiles use `upsert` (idempotent writes),
interview turns persist `conversation_history` and `status` on every
message, and roadmap generation and progress updates both write
immediately. If you run into a specific case where something isn't
being saved as expected, flag the endpoint and I'll take a closer look.

### ⚠️ Important assumption to verify

The Interview and Roadmap services assume the FastAPI service exposes:

```
POST /interview/start    { profile }                          -> { question, conversation_history, is_complete }
POST /interview/respond  { conversation_history, message }     -> { question, conversation_history, is_complete }
POST /roadmap/generate   { profile, interview_summary }        -> { goal, milestones }
```

These paths and shapes were **not** given in the role guide, so they're
placeholders in `src/services/aiService.client.ts`. Update that file's
URL strings and field names once you confirm the real FastAPI contract
— nothing else in the codebase needs to change, since every other layer
just calls the typed functions in that one file.

## What's included in Phase 4

Two node-cron jobs, registered on server startup (`src/cron/index.ts`),
both iterating every user who has a learner profile (see "active users"
note below):

- **Daily nudge check** — `0 8 * * *` (08:00 server time). For each
  user: calls FastAPI with their profile + recent session activity; if
  `nudge_triggered` comes back true, saves a `nudges_log` row and calls
  the notification stub.
- **Weekly review** — `0 18 * * 0` (Sunday 18:00 server time). For each
  user: calls FastAPI with their profile + the past 7 days of session
  logs; saves the result as a `feedback_events` row and upserts each
  returned topic score into `mastery_scores`.

Both jobs call plain service functions directly rather than making an
HTTP request to the backend's own API — no need to round-trip through
the network for work the same process can already do.

The same logic is also exposed as manual-trigger routes (self-only,
`Authorization: Bearer <token>` must match `:userId`):

- `GET /api/nudges/check/:userId` — run a nudge check right now
- `GET /api/nudges/:userId` — list a user's nudge history
- `POST /api/reviews/weekly/:userId` — run a weekly review right now
- `GET /api/reviews/weekly/:userId` — list a user's past reviews
- `GET /api/reviews/mastery/:userId` — current mastery score per topic

### ⚠️ Two assumptions worth revisiting

1. **"Active users"** (`findActiveUserIds` in `src/services/nudge.service.ts`)
   is currently defined as "has a learner profile" — i.e. completed
   onboarding. There's no activity recency filter yet. Once there's real
   usage data, you'll likely want to exclude long-dormant users.
2. **Notifications** (`src/services/notification.service.ts`) currently
   just logs — Phase 5 replaces the body of `sendNotification` with real
   email/push delivery. Nothing else needs to change.
3. **FastAPI contract** for `/nudges/check` and `/reviews/weekly` is
   assumed the same way Interview/Roadmap were in Phase 2 — adjust
   `src/services/aiService.client.ts` once the real shape is confirmed.

## What's included in Phase 5

`sendNotification` (called by the nudge cron job) now actually delivers,
through two independent channels — one failing doesn't block the other:

- **Email** — `src/services/email.service.ts`, via `nodemailer` over
  SMTP. Works with any SMTP provider: SendGrid, Resend, Mailtrap (for
  testing), or plain Gmail SMTP. Sent to the user's account email.
- **Browser push** — `src/services/push.service.ts`, via `web-push`
  (VAPID protocol). Sent to every device the user has subscribed from.
  Expired/revoked subscriptions (404/410 from the push service) are
  automatically cleaned up from `push_subscriptions`.

New routes for the frontend to manage push subscriptions:

- `GET /api/push/vapid-public-key` — public, no auth. The frontend needs
  this to call `PushManager.subscribe()` in the browser.
- `POST /api/push/subscribe` — save a subscription for the logged-in user
- `POST /api/push/unsubscribe` — remove a subscription by endpoint

### Configuration

Both channels are **optional at boot** — if their env vars aren't set,
the server still starts, and that channel just logs a warning and skips
sending instead of failing the whole notification. Fill in `.env`:

```bash
# Email
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="AI Mentor <no-reply@ai-mentor.app>"

# Push (generate once with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@ai-mentor.app
```

### ⚠️ Worth knowing

- Push notifications only work for **browsers** (web push). If the
  frontend ever ships as a native mobile app, that's a different
  integration (FCM/APNs) — this implementation doesn't cover it.
- Email currently sends a single plain-text message per nudge. If you
  want HTML templates or digest-style batching (e.g. one email summarizing
  several nudges), that's a straightforward change inside `email.service.ts`
  without touching any caller.

## Folder structure

```
src/
  config/       env, prisma client, logger
  routes/       URL → controller mapping
  controllers/  request/response only, no business logic
  services/     business logic, DB calls, (later) FastAPI calls
  middleware/   auth, validation, error handling, logging
  types/        Zod schemas, Express type augmentation
  app.ts        Express app + middleware wiring
  server.ts     entrypoint, graceful shutdown
prisma/
  schema.prisma
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in `DATABASE_URL`, a strong `JWT_SECRET`, and `AI_SERVICE_BASE_URL`
   (wherever your FastAPI service runs, e.g. `http://localhost:8000`).

3. **Start Postgres** (either your own instance, or via Docker):
   ```bash
   docker compose up -d postgres
   ```

4. **Run migrations** (creates all 9 tables: `users`, `learner_profiles`,
   `interview_sessions`, `roadmaps`, `sessions_log`, `mastery_scores`,
   `nudges_log`, `feedback_events`, `push_subscriptions`):
   ```bash
   npm run prisma:migrate -- --name init
   ```
   If you already migrated during an earlier phase, run a fresh
   migration for the new table instead:
   ```bash
   npm run prisma:migrate -- --name phase5_push_subscriptions
   ```

5. **Start the dev server**
   ```bash
   npm run dev
   ```
   Server runs on `http://localhost:4000`. Health check at `/health`.

## Testing the auth flow

```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"supersecret123"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"supersecret123"}'

# Me (use the token returned above)
curl http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

## What's NOT in this phase

Everything through Phase 6 (deployment) is now covered. See below.

## Phase 6 — Deployment (Render)

Target: **Render**, using the included `render.yaml` Blueprint.

### What the Blueprint provisions
- **Web service** (`ai-mentor-backend`) — builds from the existing `Dockerfile`,
  `starter` plan (always-on, no spin-down), health-checked at `/health`
- **Managed Postgres** (`ai-mentor-db`) — free plan to start

### Migrations on deploy
`preDeployCommand: npx prisma migrate deploy` runs before every deploy, so
schema changes apply automatically. This uses `prisma migrate deploy` (applies
existing migrations only), **not** `prisma migrate dev` (which can prompt
interactively and isn't safe in a non-interactive deploy pipeline) — that's
why `prisma:deploy` was added as its own `package.json` script, separate from
the existing `prisma:migrate` used for local dev.

### Deploy steps
1. Push this repo to GitHub/GitLab/Bitbucket (Render Blueprints require a Git remote).
2. In the Render Dashboard: **New → Blueprint**, point it at the repo.
3. Render reads `render.yaml` and prompts for every `sync: false` var:
   `AI_SERVICE_BASE_URL`, `CORS_ORIGIN`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`,
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. `JWT_SECRET` is auto-generated by
   Render (`generateValue: true`), and `DATABASE_URL` is wired automatically
   from the provisioned database.
4. Deploy. First build runs `preDeployCommand` (migrations) before starting
   the server.

### Two things that will bite you if skipped
- **Free web-service plan will silently break your cron jobs.** Phase 4's
  `node-cron` jobs (daily nudge check, weekly review) run in-process. Render's
  free tier spins the service down after 15 minutes idle — if the process is
  asleep at `0 8 * * *`, that run just never happens, no error, no log. The
  Blueprint is set to `plan: starter` (~$7/mo, always-on) for exactly this
  reason. Don't downgrade to free unless you're OK with nudges/reviews being
  unreliable.
- **Free Postgres is hard-deleted 30 days after creation** (14-day grace
  period to upgrade before data loss, no backups even during that period).
  Fine while you're iterating; upgrade to a paid plan (`basic-256mb` or
  higher) before you have real user data you care about.

### Single-instance constraint
`numInstances: 1` is intentional — `node-cron` has no distributed lock, so
2+ instances would each fire the same nudge/review job, sending duplicate
notifications. If you ever need to scale the web service horizontally, move
the cron logic to Render's native `cron` service type first (runs as a
separate one-off job, not duplicated per web instance).

## Next steps

All 6 phases are done. Possible follow-ups if you want to keep going:
- Move `node-cron` to Render's native Cron Job service type (removes the
  single-instance constraint above)
- Add a staging environment (a second Blueprint/branch pointed at `preview`)
- Confirm the real FastAPI contract in `aiService.client.ts` (still using
  the assumed endpoint paths from Phase 2)

