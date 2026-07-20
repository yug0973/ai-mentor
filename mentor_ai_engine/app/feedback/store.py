"""
Persistent (in-memory) feedback event store for Phase 8 (Feedback Loop /
Eval Harness). Replaces the original print-only line in app/routers/feedback.py
with real storage so events can actually be aggregated (app/feedback/eval.py)
instead of just appearing in stdout.

Same "swap for Redis/DB before production" caveat as every other in-memory
store in this service (app/storage.py, app/memory/store.py,
app/roadmap/store.py) — wiped on restart, not shared across workers.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock


@dataclass
class FeedbackEvent:
    feedback_id: str
    user_id: str
    event_type: str
    reference_id: str
    outcome_note: str | None
    logged_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class FeedbackStore:
    def __init__(self):
        self._events: list[FeedbackEvent] = []
        self._lock = Lock()

    def log(
        self,
        user_id: str,
        event_type: str,
        reference_id: str,
        outcome_note: str | None,
    ) -> FeedbackEvent:
        with self._lock:
            event = FeedbackEvent(
                feedback_id=str(uuid.uuid4()),
                user_id=user_id,
                event_type=event_type,
                reference_id=reference_id,
                outcome_note=outcome_note,
            )
            self._events.append(event)
            return event

    def all(self) -> list[FeedbackEvent]:
        with self._lock:
            return list(self._events)

    def for_user(self, user_id: str) -> list[FeedbackEvent]:
        with self._lock:
            return [e for e in self._events if e.user_id == user_id]


feedback_store = FeedbackStore()
