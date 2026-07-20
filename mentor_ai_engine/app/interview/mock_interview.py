"""
A fixed, scripted interview flow used when MOCK_LLM=true.
No network calls, no API key needed. Lets frontend build and test the
entire chat UI (including the "complete" state and profile screen)
without any dependency on the real LLM.
"""

from app.models import LearnerProfile

SCRIPTED_QUESTIONS = [
    "What's the main thing you're trying to achieve, and roughly by when?",
    "Which area of tech is this in — web dev, DSA/interview prep, ML, mobile, backend, or something else?",
    "How would you describe your current level — beginner, intermediate, or advanced?",
    "How many weeks are you giving yourself, and how many hours per week can you realistically commit?",
    "Any technologies or concepts you already know?",
]

MOCK_PROFILE = LearnerProfile(
    goal="job-ready in backend development",
    domain="backend",
    current_level="beginner",
    timeline_weeks=12,
    hours_per_week=8,
    known_skills=["python-basic"],
    weak_areas=[],
    preferred_learning_style="project-based",
    motivation_type="career-switch",
    constraints=["works full-time"],
)


class MockInterviewSession:
    """Drop-in replacement for InterviewSession — same public interface,
    zero LLM calls. Used automatically when settings.MOCK_LLM is true."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.status = "in_progress"
        self.learner_profile: LearnerProfile | None = None
        self.turn_count = 0
        self.history: list[dict] = []

    def start(self) -> str:
        msg = SCRIPTED_QUESTIONS[0]
        self.history.append({"role": "assistant", "content": msg})
        return msg

    def submit_answer(self, user_message: str) -> dict:
        self.history.append({"role": "user", "content": user_message})
        self.turn_count += 1

        if self.turn_count >= len(SCRIPTED_QUESTIONS):
            self.status = "complete"
            self.learner_profile = MOCK_PROFILE
            return {"status": "complete", "profile": MOCK_PROFILE}

        next_q = SCRIPTED_QUESTIONS[self.turn_count]
        self.history.append({"role": "assistant", "content": next_q})
        return {"status": "in_progress", "message": next_q}
