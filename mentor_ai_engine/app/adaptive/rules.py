"""
Rule-based decision layer for Phase 4 (Adaptive Roadmap Engine).
Versioned like app/memory/mastery.py and the prompt files, so thresholds can
be tuned/A-B'd later without losing track of what produced a given
adaptation.

Deliberately deterministic and LLM-free: WHETHER to adapt (which topics are
weak, whether a milestone passed, what unlocks next) is mechanical given a
QuizResult plus current Phase 3 mastery scores. Only the CONTENT of new
remediation topics needs an LLM (see app/adaptive/prompts.py,
app/adaptive/engine.py) — matching the README's "rule-based logic + a
targeted LLM rewrite" design for Phase 4.
"""

ADAPTIVE_MODEL_VERSION = "adaptive_v1"

# Milestone-level checkpoint quiz score at/above this counts as a "pass" —
# topics in the milestone that aren't individually flagged weak get marked
# completed, which can unlock downstream topics.
MILESTONE_PASS_THRESHOLD = 70.0

# Per-topic weakness score (0-1, higher = weaker) at/above this triggers a
# remediation topic insertion for that specific topic, independent of
# whether the milestone as a whole passed.
WEAK_TOPIC_THRESHOLD = 0.45

# Weighting between the quiz result and the topic's Phase 3 mastery score
# when computing weakness. Quiz gets the larger share since it's the more
# direct, immediate signal; mastery smooths it out so, e.g., one unlucky
# quiz on an otherwise well-practiced topic doesn't overreact.
QUIZ_WEIGHT = 0.65
MASTERY_WEIGHT = 0.35

# Used when a topic covered by the checkpoint quiz has no logged Phase 3
# sessions yet (mastery map has no entry for it) — a neutral prior rather
# than assuming either full mastery or zero.
DEFAULT_MASTERY_PRIOR = 0.5

# estimated_hours multiplier applied to a topic flagged weak, on top of
# inserting a dedicated remediation topic ahead of it — reflects that the
# original topic itself will likely take the learner longer now too.
WEAK_TOPIC_HOURS_MULTIPLIER = 1.25
MAX_ESTIMATED_HOURS = 40


def topic_weakness(quiz_score_percent: float, mastery_score: float) -> float:
    """
    Returns 0-1, higher = weaker. Combines the checkpoint quiz score for this
    topic (or the milestone's overall score, if no per-topic breakdown was
    given for it) with its running Phase 3 mastery score.
    """
    quiz_frac = max(0.0, min(1.0, quiz_score_percent / 100.0))
    mastery_frac = max(0.0, min(1.0, mastery_score))
    strength = QUIZ_WEIGHT * quiz_frac + MASTERY_WEIGHT * mastery_frac
    return round(1.0 - strength, 4)


def is_weak(quiz_score_percent: float, mastery_score: float) -> bool:
    return topic_weakness(quiz_score_percent, mastery_score) >= WEAK_TOPIC_THRESHOLD


def milestone_passed(score_percent: float) -> bool:
    return score_percent >= MILESTONE_PASS_THRESHOLD


def bumped_hours(current_hours: int) -> int:
    return max(1, min(MAX_ESTIMATED_HOURS, round(current_hours * WEAK_TOPIC_HOURS_MULTIPLIER)))
