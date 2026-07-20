"""
Mock data generators for Phase 2-8 stub endpoints.

These exist so backend/frontend can build the ENTIRE pipeline (DB schema,
UI screens, integration wiring) against realistic, correctly-shaped
responses TODAY, before the real AI logic is built.

When a phase is actually implemented, only the router file for that phase
changes — request/response models and endpoint paths stay identical, so
nothing downstream breaks.
"""

from datetime import datetime, timedelta
from app.models import (
    Roadmap, RoadmapMilestone, RoadmapTopic,
    TopicMastery, SessionLogResponse,
    AdaptRoadmapResponse, ClassifyIntentResponse,
    NudgeCheckResponse, WeeklyReviewResponse,
    QuizQuestion, LessonContent, LessonPracticeQuestion,
)


import uuid

def mock_roadmap(user_id: str, goal: str) -> Roadmap:
    return Roadmap(
        roadmap_id=f"mock-roadmap-{uuid.uuid4()}",
        user_id=user_id,
        goal=goal,
        progress_percent=0.0,
        milestones=[
            RoadmapMilestone(
                milestone_id="m1",
                title="Foundations",
                checkpoint_quiz_id="quiz-m1",
                topics=[
                    RoadmapTopic(
                        topic_id="t1", title="Core Syntax & Fundamentals",
                        description="Placeholder topic — real content generated in Phase 2.",
                        estimated_hours=6, status="available", prerequisites=[],
                    ),
                    RoadmapTopic(
                        topic_id="t2", title="Data Structures Basics",
                        description="Placeholder topic — real content generated in Phase 2.",
                        estimated_hours=8, status="locked", prerequisites=["t1"],
                    ),
                ],
            ),
            RoadmapMilestone(
                milestone_id="m2",
                title="Applied Practice",
                checkpoint_quiz_id="quiz-m2",
                topics=[
                    RoadmapTopic(
                        topic_id="t3", title="Build a Small Project",
                        description="Placeholder topic — real content generated in Phase 2.",
                        estimated_hours=10, status="locked", prerequisites=["t2"],
                    ),
                ],
            ),
        ],
    )


def mock_session_log_response() -> SessionLogResponse:
    return SessionLogResponse(
        logged=True,
        updated_mastery=[
            TopicMastery(topic_id="t1", mastery_score=0.65, last_updated=datetime.utcnow().isoformat()),
        ],
    )


def mock_adapt_response(roadmap_id: str, user_id: str, goal: str) -> AdaptRoadmapResponse:
    return AdaptRoadmapResponse(
        roadmap_id=roadmap_id,
        changed=True,
        change_summary="MOCK: Inserted a remediation topic before Milestone 2 based on quiz score.",
        updated_roadmap=mock_roadmap(user_id, goal),
    )


def mock_intent_classification(message: str) -> ClassifyIntentResponse:
    text = message.lower()
    if "?" in text:
        intent = "asking_question"
    elif any(w in text for w in ["stuck", "hard", "frustrat", "giving up", "can't"]):
        intent = "expressing_frustration"
    elif any(w in text for w in ["done", "finished", "completed"]):
        intent = "reporting_progress"
    else:
        intent = "off_topic"
    return ClassifyIntentResponse(intent=intent, confidence=0.55)  # low confidence flags it as mock


def mock_nudge_check() -> NudgeCheckResponse:
    return NudgeCheckResponse(
        nudge_triggered=True,
        nudge_message="MOCK: Hey, noticed you haven't logged a session in a few days — everything okay?",
        suggested_action="offer_lighter_session",
        trigger_reason="mock_inactivity_signal",
    )


def mock_weekly_review(user_id: str) -> WeeklyReviewResponse:
    today = datetime.utcnow().date()
    week_start = today - timedelta(days=7)
    return WeeklyReviewResponse(
        user_id=user_id,
        week_start=week_start.isoformat(),
        week_end=today.isoformat(),
        sessions_completed=3,
        total_hours=5.5,
        topics_improved=["t1"],
        topics_stagnant=["t2"],
        goal_progress_percent=18.0,
        next_week_focus="MOCK: Focus on Data Structures Basics (t2) — mastery hasn't moved.",
        motivational_insight="MOCK: You're 18% toward your goal — consistent pace, keep it up.",
    )


def mock_quiz_questions(topics: list[RoadmapTopic]) -> list[QuizQuestion]:
    """Fallback used only if real generation fails after retries, or MOCK_LLM=true.
    Topic-title-aware (better than a fully generic question) but still clearly
    labeled MOCK — this is a degrade path, not the intended quiz experience."""
    return [
        QuizQuestion(
            topic_id=t.topic_id,
            question=f"MOCK QUESTION — real generation unavailable. Which best relates to \"{t.title}\"?",
            options=[
                f"A concept unrelated to {t.title}",
                f"The core idea behind {t.title}",
                "Neither of these",
                "Not enough information",
            ],
            correct_index=1,
        )
        for t in topics
    ]


def mock_lesson_content(topic: RoadmapTopic) -> LessonContent:
    """Fallback used only if real generation fails after retries, or MOCK_LLM=true.
    Deliberately has_code_example=False and no code block — a mock has no way to
    know if this topic is actually code-related, so it stays honest rather than
    guessing (which is exactly the bug this feature was built to fix)."""
    return LessonContent(
        explanation=[
            f"MOCK CONTENT — real generation unavailable. This would normally be a real, "
            f"domain-appropriate explanation of \"{topic.title}\".",
            f"Topic description on file: {topic.description}",
        ],
        has_code_example=False,
        code_example=None,
        practice_questions=[
            LessonPracticeQuestion(
                question=f"MOCK QUESTION {i+1} — Which best relates to \"{topic.title}\"?",
                options=[
                    f"A concept unrelated to {topic.title}",
                    f"The core idea behind {topic.title}",
                    "Neither of these",
                    "Not enough information",
                ],
                correct_index=1,
                hint="This is placeholder content — real generation was unavailable.",
            )
            for i in range(3)
        ],
    )
