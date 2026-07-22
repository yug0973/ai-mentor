from pydantic import BaseModel, Field
from typing import Literal


# ---------- Interview I/O ----------

class StartInterviewResponse(BaseModel):
    session_id: str
    mentor_message: str
    status: Literal["in_progress"] = "in_progress"


class InterviewMessageRequest(BaseModel):
    session_id: str
    message: str


class InterviewMessageResponse(BaseModel):
    session_id: str
    status: Literal["in_progress", "complete"]
    mentor_message: str | None = None       # present when status == in_progress
    learner_profile: "LearnerProfile | None" = None  # present when status == complete


# ---------- The core output of Phase 1: structured learner profile ----------
# This JSON is what feeds the Roadmap Generator (Phase 2) downstream.

class LearnerProfile(BaseModel):
    goal: str = Field(..., description="What the learner wants to achieve, e.g. 'job-ready in backend dev'")
    domain: str = Field(..., description="Tech/coding sub-domain, e.g. 'web dev', 'DSA', 'ML', 'mobile'")
    current_level: Literal["beginner", "intermediate", "advanced"]
    timeline_weeks: int = Field(..., ge=1, le=104)
    hours_per_week: int = Field(..., ge=1, le=80)
    known_skills: list[str] = Field(default_factory=list)
    weak_areas: list[str] = Field(default_factory=list)
    preferred_learning_style: str | None = Field(
        default=None, description="e.g. 'project-based', 'video', 'reading docs'"
    )
    motivation_type: str | None = Field(
        default=None, description="e.g. 'career-switch', 'exam prep', 'curiosity'"
    )
    constraints: list[str] = Field(default_factory=list, description="e.g. 'works full-time', 'exam in March'")


InterviewMessageResponse.model_rebuild()


# ---------- Phase 2: Roadmap ----------

class RoadmapTopic(BaseModel):
    topic_id: str
    title: str
    description: str
    estimated_hours: int
    status: Literal["locked", "available", "in_progress", "completed"] = "available"
    prerequisites: list[str] = Field(default_factory=list, description="List of topic_ids")


class RoadmapMilestone(BaseModel):
    milestone_id: str
    title: str
    topics: list[RoadmapTopic]
    checkpoint_quiz_id: str | None = None


class Roadmap(BaseModel):
    roadmap_id: str
    user_id: str
    goal: str
    milestones: list[RoadmapMilestone]
    progress_percent: float = 0.0
    generated_from_profile_version: str = "v1"


class GenerateRoadmapRequest(BaseModel):
    user_id: str
    learner_profile: LearnerProfile


# ---------- Phase 3: Session Tracking ----------

class SessionLogRequest(BaseModel):
    user_id: str
    roadmap_id: str
    topic_ids_covered: list[str]
    duration_minutes: int
    self_rated_difficulty: Literal["easy", "medium", "hard"] | None = None
    notes: str | None = None


class TopicMastery(BaseModel):
    topic_id: str
    mastery_score: float = Field(..., ge=0.0, le=1.0)
    last_updated: str


class SessionLogResponse(BaseModel):
    logged: bool
    updated_mastery: list[TopicMastery]


# ---------- Phase 4: Adaptive Roadmap ----------

class QuizResult(BaseModel):
    user_id: str
    roadmap_id: str
    milestone_id: str
    quiz_id: str
    score_percent: float = Field(..., ge=0.0, le=100.0)
    topic_breakdown: dict[str, float] = Field(
        default_factory=dict, description="topic_id -> score_percent on that topic"
    )


class AdaptRoadmapResponse(BaseModel):
    roadmap_id: str
    changed: bool
    change_summary: str
    updated_roadmap: Roadmap


# ---------- Checkpoint Quiz Generation ----------
# Feeds INTO Phase 4: the frontend renders these questions, scores the
# learner's answers client-side, then posts a QuizResult (above) to
# /roadmap/adapt. This step only produces the questions themselves.

class QuizQuestion(BaseModel):
    topic_id: str
    question: str
    options: list[str] = Field(..., min_length=4, max_length=4)
    correct_index: int = Field(..., ge=0, le=3)


class GenerateQuizRequest(BaseModel):
    milestone_id: str
    current_level: str
    topics: list[RoadmapTopic]


class GenerateQuizResponse(BaseModel):
    questions: list[QuizQuestion]


# ---------- Per-Topic Lesson Content ----------
# Real, domain-aware content for the topic study modal — replaces the
# frontend's old hardcoded fake lesson text + fake JS code snippet that
# was shown unconditionally for every topic regardless of subject matter.

class LessonCodeExample(BaseModel):
    language: str
    code: str


class LessonPracticeQuestion(BaseModel):
    question: str
    options: list[str] = Field(..., min_length=4, max_length=4)
    correct_index: int = Field(..., ge=0, le=3)
    hint: str


class LessonContent(BaseModel):
    explanation: list[str]
    has_code_example: bool
    code_example: LessonCodeExample | None = None
    practice_questions: list[LessonPracticeQuestion]


class GenerateLessonRequest(BaseModel):
    topic: RoadmapTopic
    domain: str
    current_level: str


class GenerateLessonResponse(BaseModel):
    lesson: LessonContent


# ---------- Phase 5: Intent Parser ----------

class ClassifyIntentRequest(BaseModel):
    user_id: str
    message: str


class ClassifyIntentResponse(BaseModel):
    intent: Literal[
        "asking_question",
        "reporting_progress",
        "expressing_frustration",
        "requesting_change",
        "off_topic",
        "quiz_response",
    ]
    confidence: float = Field(..., ge=0.0, le=1.0)


# ---------- Phase 6: Motivation / Nudges ----------

class NudgeCheckResponse(BaseModel):
    nudge_triggered: bool
    nudge_message: str | None = None
    suggested_action: str | None = None
    trigger_reason: str | None = None


# ---------- Phase 7: Weekly Review ----------

class WeeklyReviewResponse(BaseModel):
    user_id: str
    week_start: str
    week_end: str
    sessions_completed: int
    total_hours: float
    topics_improved: list[str]
    topics_stagnant: list[str]
    goal_progress_percent: float
    next_week_focus: str
    motivational_insight: str


# ---------- Phase 8: Feedback Loop ----------

class FeedbackEventRequest(BaseModel):
    user_id: str
    event_type: Literal[
        "nudge_shown", "nudge_followed", "nudge_ignored",
        "roadmap_change_accepted", "roadmap_change_reverted",
    ]
    reference_id: str = Field(..., description="e.g. nudge_id or roadmap_id this feedback relates to")
    outcome_note: str | None = None


class FeedbackEventResponse(BaseModel):
    logged: bool


# ---------- Ongoing Mentor Chat (post-onboarding, throughout the journey) ----------

class ChatMessageTurn(BaseModel):
    role: Literal["user", "mentor"]
    content: str


class ChatRequest(BaseModel):
    user_id: str
    message: str
    learner_profile: LearnerProfile
    roadmap: Roadmap | None = Field(
        None, description="Learner's active roadmap, if one exists yet — omitted pre-roadmap."
    )
    mastery_scores: list[TopicMastery] = Field(default_factory=list)
    conversation_history: list[ChatMessageTurn] = Field(
        default_factory=list,
        description="Recent prior turns, oldest first, for continuity. Caller (backend) "
        "decides how much history to include — this endpoint is stateless.",
    )


class ChatResponse(BaseModel):
    reply: str
    changed: bool = False
    change_summary: str | None = None
    updated_roadmap: Roadmap | None = None