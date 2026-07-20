"""
In-memory roadmap store, added for Phase 4 (Adaptive Roadmap Engine).

Phase 4's request schema (`QuizResult`, see API_CONTRACT.md) deliberately
does NOT include the roadmap itself — only a `roadmap_id` — because backend
owns long-term roadmap persistence, not this service. But `/roadmap/adapt`
still needs the actual milestone/topic structure to reason about and
rewrite, so this service keeps its own short-lived copy: populated whenever
`/roadmap/generate` runs (see app/routers/roadmap.py) and updated in place
whenever `/roadmap/adapt` changes it (see app/adaptive/engine.py).

Same "swap for Redis/DB before production" caveat as SessionStore
(app/storage.py) and MemoryStore (app/memory/store.py) — this dict is wiped
on restart and isn't shared across multiple server workers/instances. If a
roadmap_id isn't found here (different process, a restart, or a roadmap
backend persisted some other way without ever calling /roadmap/generate on
this service), /roadmap/adapt degrades to mock output rather than 404ing —
see app/routers/adaptive.py.
"""
from threading import Lock

from app.models import Roadmap


class RoadmapStore:
    def __init__(self):
        self._roadmaps: dict[str, Roadmap] = {}
        self._lock = Lock()

    def save(self, roadmap: Roadmap) -> None:
        with self._lock:
            self._roadmaps[roadmap.roadmap_id] = roadmap

    def get(self, roadmap_id: str) -> Roadmap | None:
        with self._lock:
            return self._roadmaps.get(roadmap_id)


roadmap_store = RoadmapStore()
