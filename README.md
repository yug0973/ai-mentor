# AI Mentor — Full Backend

Two services, run together via `docker-compose` from `backend/`:

```
ai-mentor-backend-phase1/
    backend/         Node/Express/TypeScript gateway (source of truth for the API contract)
    mentor-brain/     FastAPI AI service (interview/roadmap/nudge/review generation)
```

`Frontend → backend (Node) → mentor-brain (FastAPI)`. The frontend never
calls `mentor-brain` directly, and `mentor-brain`'s request/response
shapes are locked to exactly what `backend/src/services/aiService.client.ts`
sends and expects — verified field-by-field against that file, the Zod
`profile.schema.ts`, and the Prisma `SessionLog` model.

## Running both together

```bash
cd backend
cp .env.example .env
cp ../mentor-brain/.env.example ../mentor-brain/.env
docker-compose up -d
```

This starts three containers: `postgres`, `mentor-brain` (port 8000), and
`backend` (port 4000). Inside the compose network, `backend` reaches
`mentor-brain` at `http://mentor-brain:8000` — `docker-compose.yml`
overrides `AI_SERVICE_BASE_URL` for exactly this reason, since the
`.env` file's `http://localhost:8000` is only correct when running
`backend` outside Docker.

Reload `.env` changes with `docker-compose up -d` (not `restart`), same
as before — this is unchanged by adding the second service.

## Where things live

- **Node backend** (`backend/`) — auth, persistence, scheduling
  (`node-cron`), notifications (SMTP/VAPID), and the FastAPI gateway
  client. Untouched by this work — see `backend/README.md` for its own
  docs.
- **Mentor Brain** (`mentor-brain/`) — see `mentor-brain/README.md` for
  its endpoints, the mock-vs-Gemini toggle, and its verification status
  (Gemini calls are wired and unit-tested with mocks, but not yet
  exercised against the live API — see that README for details before
  trusting `AI_PROVIDER_ENABLED=true`).
