import uuid
from app.config import settings
from app.interview.state_machine import InterviewSession
from app.interview.mock_interview import MockInterviewSession


class SessionStore:
    """
    In-memory store for Phase 1. Fine for local dev / demo.
    NOTE for backend team: replace with Redis (session TTL) or a DB table
    keyed by session_id before production — this dict is wiped on restart
    and won't work across multiple server workers/instances.

    Transparently creates a MockInterviewSession instead of the real one
    when MOCK_LLM=true — same interface, so nothing else in the codebase
    (or the frontend calling it) needs to know or care.
    """

    def __init__(self):
        self._sessions: dict[str, InterviewSession | MockInterviewSession] = {}

    def create(self) -> InterviewSession | MockInterviewSession:
        session_id = str(uuid.uuid4())
        session = MockInterviewSession(session_id) if settings.MOCK_LLM else InterviewSession(session_id)
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> InterviewSession | MockInterviewSession | None:
        return self._sessions.get(session_id)


session_store = SessionStore()
