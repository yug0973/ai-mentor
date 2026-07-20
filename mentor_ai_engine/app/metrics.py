"""
Lightweight, dependency-free observability hook.

No external metrics backend is wired up (matches the $0-stack constraint —
see README/API_CONTRACT). This gives:
  1. Structured, greppable JSON log lines for every recorded event.
  2. An in-memory counter per event name, exposed at GET /metrics.

This is enough to notice things like "roadmap generation is silently falling
back to mock more than expected" without needing Datadog/Prometheus. Swapping
this for a real metrics backend later is a one-file change — same pattern as
LLMClient (app/llm_client.py) and SessionStore (app/storage.py).
"""
import json
import logging
import time
from collections import defaultdict
from threading import Lock

logger = logging.getLogger("mentor_ai_engine.metrics")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
    logger.propagate = False

_counters: dict[str, int] = defaultdict(int)
_lock = Lock()


def record_event(event: str, **fields) -> None:
    """
    Record a metric/log event.
    - Increments an in-memory counter for `event` (visible at GET /metrics).
    - Emits a structured JSON log line so it's greppable in stdout/logs today
      and ready to forward to a real log aggregator or metrics backend later
      without any caller changes.

    Keep `fields` small and JSON-serializable (ids, counts, short strings) —
    not full payloads.
    """
    with _lock:
        _counters[event] += 1
        count = _counters[event]

    payload = {"event": event, "count": count, "ts": round(time.time(), 3), **fields}
    logger.info(json.dumps(payload, default=str))


def get_counters() -> dict[str, int]:
    """Snapshot of all event counts since process start."""
    with _lock:
        return dict(_counters)
