"""
In-memory session log + mastery store for Phase 3 (Session Tracker / Memory
Layer). Same "swap later" pattern as app/storage.py's SessionStore: fine for
local dev/demo, NOT safe across multiple server workers/instances or restarts.
Backend team should replace this with Redis or a DB table keyed by user_id
before production — it's intentionally isolated behind MemoryStore so that
swap is a one-file change.

Stores more than the SessionLogResponse schema strictly requires (raw session
history, not just current mastery) because Phase 6 (Nudges — needs "days
since last session") and Phase 7 (Weekly Review — needs sessions_completed,
total_hours, topics_improved/stagnant over a date range) will both read from
this same memory layer rather than duplicating session storage.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock

from app.memory.mastery import update_mastery_score
from app.models import TopicMastery


@dataclass
class SessionRecord:
    session_log_id: str
    user_id: str
    roadmap_id: str
    topic_ids_covered: list[str]
    duration_minutes: int
    self_rated_difficulty: str | None
    notes: str | None
    logged_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class MemoryStore:
    def __init__(self):
        self._mastery: dict[str, dict[str, float]] = {}  # user_id -> {topic_id: score}
        self._sessions: dict[str, list[SessionRecord]] = {}  # user_id -> [SessionRecord]
        self._lock = Lock()

    def log_session(
        self,
        user_id: str,
        roadmap_id: str,
        topic_ids_covered: list[str],
        duration_minutes: int,
        self_rated_difficulty: str | None,
        notes: str | None,
    ) -> list[TopicMastery]:
        with self._lock:
            record = SessionRecord(
                session_log_id=str(uuid.uuid4()),
                user_id=user_id,
                roadmap_id=roadmap_id,
                topic_ids_covered=list(topic_ids_covered),
                duration_minutes=duration_minutes,
                self_rated_difficulty=self_rated_difficulty,
                notes=notes,
            )
            self._sessions.setdefault(user_id, []).append(record)

            if not topic_ids_covered:
                return []

            # Equal time split across covered topics — the request schema
            # doesn't collect a per-topic time breakdown (see SessionLogRequest
            # in API_CONTRACT.md), so this is the best available signal.
            exposure_minutes = duration_minutes / len(topic_ids_covered)

            user_mastery = self._mastery.setdefault(user_id, {})
            updated: list[TopicMastery] = []
            now_iso = datetime.now(timezone.utc).isoformat()

            for topic_id in topic_ids_covered:
                current = user_mastery.get(topic_id, 0.0)
                new_score = update_mastery_score(
                    current_score=current,
                    exposure_minutes=exposure_minutes,
                    self_rated_difficulty=self_rated_difficulty,
                )
                user_mastery[topic_id] = new_score
                updated.append(TopicMastery(
                    topic_id=topic_id,
                    mastery_score=new_score,
                    last_updated=now_iso,
                ))

            return updated

    def get_mastery_map(self, user_id: str) -> dict[str, float]:
        with self._lock:
            return dict(self._mastery.get(user_id, {}))

    def get_sessions(self, user_id: str) -> list[SessionRecord]:
        with self._lock:
            return list(self._sessions.get(user_id, []))


memory_store = MemoryStore()
