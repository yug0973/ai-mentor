<div align="center">

# 🧭 AI Mentor

### *Not another course. A route built around where you actually are.*

One honest conversation in — and AI Mentor plots the milestones, checkpoints, and practice between here and job-ready. Then it re-routes every time you check something off.

[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Gemini](https://img.shields.io/badge/Gemini-AI%20Engine-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)](https://ai.google.dev)

</div>

---

## 🏕️ What this actually is

AI Mentor interviews you like a real mentor would — your goal, your hours, what you already know, how you like to learn — then builds a **personalized learning roadmap** from scratch. No template course outline. Every milestone, every topic, every checkpoint quiz is generated for *you*, and the route bends every time you clear a checkpoint or struggle on one.

```
Trailhead              Basecamp              Switchbacks             Summit
(the interview)   →   (your roadmap)   →   (adaptive practice)   →   (job-ready)
```

## ✨ Features

| | |
|---|---|
| 🎙️ **Conversational interview** | A real back-and-forth, not a dropdown form — understands goal, timeline, current level, and learning style |
| 🗺️ **Generated roadmap** | Milestones → topics → prerequisites, built as a real dependency graph, not a flat list |
| 📖 **Real lesson content** | Domain-aware — a presentation-design topic *reads* like a presentation-design lesson. Code examples only show up when code genuinely belongs |
| 📝 **Adaptive checkpoint quizzes** | Topic-specific questions generated per milestone. Score low, and the AI rewrites your route to reinforce the gap |
| 🔐 **Email OTP verification** | Real signup flow — hashed, rate-limited, expiring codes, not a fake gate |
| 🔔 **Nudges & weekly reviews** | Keeps momentum without nagging |
| 🎨 **A theme, not a template** | Night-hike trail-map design system — deep forest palette, trail-blaze accents, a WebGL shader backdrop, and a custom cursor |

## 🏗️ Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌───────────────────────┐
│   Frontend   │ ───▶ │  Node / Express   │ ───▶ │  mentor_ai_engine     │
│  React+Vite  │      │     Backend       │      │      (FastAPI)        │
└──────────────┘      └────────┬──────────┘      └───────────┬───────────┘
                                │                              │
                        ┌───────▼────────┐             ┌───────▼───────┐
                        │   PostgreSQL    │             │  Gemini API   │
                        │    (Prisma)     │             │  (LLM calls)  │
                        └─────────────────┘             └───────────────┘
```

- **`frontend/`** — React + Vite + Tailwind v4. Trail-map design system, real-time interview chat, roadmap visualization, checkpoint quizzes.
- **`backend/`** — Node/Express/TypeScript gateway. Auth (JWT + email OTP), Postgres persistence via Prisma, scheduling, and the single source of truth for the API contract.
- **`mentor_ai_engine/`** — FastAPI service doing all the actual AI work: interview state machine, roadmap generation, lesson content, quiz generation, adaptive rewrites — all via Gemini, all with mock-mode fallbacks for offline dev.

## 🚀 Getting started

```bash
cd backend
cp .env.example .env          # add your Postgres URL, JWT secret, SMTP creds
cp ../mentor_ai_engine/.env.example ../mentor_ai_engine/.env
# add a Gemini API key — https://aistudio.google.com/

docker compose up -d --build
npx prisma migrate dev

cd ../frontend
npm install
npm run dev
```

Frontend → `http://localhost:5173` · Backend → `http://localhost:4000` · AI Engine → `http://localhost:8000`

Set `MOCK_LLM=true` in `mentor_ai_engine/.env` to run the whole flow with zero API calls and zero cost — every phase has a realistic mock fallback.

## 📸 Screenshots

<div align="center">

**Landing**
<img src="docs/landing1.png" width="49%" /> <img src="docs/landing2.png" width="49%" />

**The Interview**
<img src="docs/interview.png" width="80%" />

**Sign In**
<img src="docs/SignIn.png" width="80%" />

**Dashboard & Roadmap**
<img src="docs/dashbored1.png" width="49%" /> <img src="docs/dashbored2.png" width="49%" />

</div>

## 🛠️ Tech stack

**Frontend** — React · TypeScript · Vite · Tailwind CSS v4 · React Router · `@paper-design/shaders-react`
**Backend** — Node.js · Express · TypeScript · Prisma · PostgreSQL · Zod · JWT
**AI Engine** — Python · FastAPI · Gemini (OpenAI-compatible) · Pydantic

---

<div align="center">

*Built one honest conversation at a time.*

</div>
