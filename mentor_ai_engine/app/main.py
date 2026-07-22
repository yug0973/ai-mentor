from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.metrics import get_counters
from app.storage import session_store
from app.models import (
    StartInterviewResponse,
    InterviewMessageRequest,
    InterviewMessageResponse,
)
from app.routers import roadmap, sessions, adaptive, intent, nudges, reviews, feedback, quiz, lesson, chat

app = FastAPI(
    title="Mentor AI Engine",
    description="Decision-making engine for the AI mentor: goal understanding, "
                 "intent parsing, roadmap generation, adaptive planning, nudges, "
                 "weekly reviews, and feedback loop.",
    version="0.8.0-phase8",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(roadmap.router)
app.include_router(sessions.router)
app.include_router(adaptive.router)
app.include_router(intent.router)
app.include_router(nudges.router)
app.include_router(reviews.router)
app.include_router(feedback.router)
app.include_router(quiz.router)
app.include_router(lesson.router)
app.include_router(chat.router)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "phases": {
            "1_goal_understanding": "live",
            "2_roadmap_generator": "live",
            "3_session_tracker": "live",
            "4_adaptive_roadmap": "live",
            "5_intent_parser": "live",
            "6_nudges": "live",
            "7_weekly_review": "live",
            "8_feedback_loop": "live",
            "9_ongoing_mentor_chat": "live",
        },
    }


@app.get("/metrics")
def metrics():
    """
    Debug/ops endpoint — NOT part of the frozen phase API_CONTRACT, just an
    internal visibility hook. Returns in-memory event counters since process
    start (see app/metrics.py). Useful for spotting things like
    roadmap_generation_fallback creeping up (real LLM generation degrading
    to mock more often than expected).
    """
    return {"counters": get_counters()}


# ---------------------------------------------------------------------------
# PHASE 1: Goal Understanding — fully LLM-driven conversational interview
# ---------------------------------------------------------------------------

@app.post("/interview/start", response_model=StartInterviewResponse)
def start_interview():
    """
    Call this when a new learner begins onboarding.
    Returns a session_id the frontend must send back with every subsequent message.
    """
    session = session_store.create()
    opening_message = session.start()
    return StartInterviewResponse(
        session_id=session.session_id,
        mentor_message=opening_message,
    )


@app.post("/interview/message", response_model=InterviewMessageResponse)
def send_interview_message(payload: InterviewMessageRequest):
    """
    Call this with the learner's reply to the mentor's last question.
    - status == "in_progress"  -> show `mentor_message` as the next question
    - status == "complete"     -> interview is done, `learner_profile` is the
                                   structured output to hand off to Phase 2
                                   (Roadmap Generator).
    """
    session = session_store.get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "complete":
        raise HTTPException(status_code=400, detail="Interview already complete for this session")

    result = session.submit_answer(payload.message)

    if result["status"] == "complete":
        return InterviewMessageResponse(
            session_id=session.session_id,
            status="complete",
            learner_profile=result["profile"],
        )

    return InterviewMessageResponse(
        session_id=session.session_id,
        status="in_progress",
        mentor_message=result["message"],
    )


@app.get("/interview/{session_id}", response_model=InterviewMessageResponse)
def get_interview_status(session_id: str):
    """Poll the current state of an interview session (useful for the frontend to resume)."""
    session = session_store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "complete":
        return InterviewMessageResponse(
            session_id=session.session_id,
            status="complete",
            learner_profile=session.learner_profile,
        )

    last_message = session.history[-1]["content"] if session.history else None
    return InterviewMessageResponse(
        session_id=session.session_id,
        status="in_progress",
        mentor_message=last_message,
    )
