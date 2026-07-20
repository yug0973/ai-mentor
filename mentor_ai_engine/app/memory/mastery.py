# Mastery-update model for Phase 3 (Session Tracker / Memory Layer).
# Versioned like the prompt files (app/interview/prompts.py, app/roadmap/prompts.py)
# so the formula can be tuned/A-B'd later without losing track of what
# produced a given mastery_score.
#
# Deliberately NOT an LLM call: mastery tracking is mechanical (time spent +
# self-reported difficulty updating a per-topic score), so there's no
# provider dependency, no cost, and no MOCK_LLM gating needed here — this
# always runs "for real," same as it would with MOCK_LLM=true or false.

MASTERY_MODEL_VERSION = "mastery_v1"

# A single-topic session of this length counts as one "reference unit" of
# learning. Sessions covering multiple topics split duration_minutes evenly
# across them (the API doesn't collect a per-topic time breakdown, so this is
# the best available signal — see API_CONTRACT.md, SessionLogRequest).
REFERENCE_SESSION_MINUTES = 30

# Fraction of the remaining "gap to mastery" (1.0 - current_score) closed by
# one full reference-length session at "medium" self-rated difficulty.
# Smaller than 1.0 on purpose: mastery should climb with repeated exposure,
# not jump to done after a single session (diminishing-returns curve).
BASE_LEARNING_RATE = 0.15

# Self-rated difficulty nudges the effective learning rate:
# - "easy"   -> the learner already had a good handle on it, so a session
#               here confirms/solidifies mastery faster.
# - "hard"   -> the learner struggled, so the session still counts (time was
#               spent) but moves the needle less until it clicks.
# - None     -> no self-rating provided, treat as medium.
DIFFICULTY_MODIFIER = {
    "easy": 1.3,
    "medium": 1.0,
    "hard": 0.6,
    None: 1.0,
}

MASTERY_FLOOR = 0.0
MASTERY_CEILING = 1.0


def update_mastery_score(
    current_score: float,
    exposure_minutes: float,
    self_rated_difficulty: str | None,
) -> float:
    """
    Exponential-approach update: each session closes a fraction of the
    remaining gap to full mastery (1.0), rather than adding a flat amount.
    This naturally produces diminishing returns as mastery climbs, and never
    overshoots 1.0 or drops below the topic's current score from a single
    logged session (mastery only goes up from studying — regression from
    inactivity, if wanted later, is a separate concern for Phase 6/7, not this
    formula).
    """
    difficulty_mult = DIFFICULTY_MODIFIER.get(self_rated_difficulty, 1.0)
    session_units = exposure_minutes / REFERENCE_SESSION_MINUTES
    learning_rate = min(BASE_LEARNING_RATE * session_units * difficulty_mult, 1.0)

    gap = MASTERY_CEILING - current_score
    new_score = current_score + gap * learning_rate

    return max(MASTERY_FLOOR, min(MASTERY_CEILING, round(new_score, 4)))
