# Prompt template for Phase 4's targeted LLM rewrite — generating remediation
# topics for the specific topics a learner scored weak on in a checkpoint
# quiz. Versioned like app/roadmap/prompts.py and app/interview/prompts.py.
#
# Deliberately narrow scope: this is NOT a full roadmap regeneration. It only
# asks for remediation content for a small, rule-selected set of weak topics
# within ONE milestone (see app/adaptive/rules.py, app/adaptive/engine.py).

PROMPT_VERSION = "adaptive_v1"

REMEDIATION_SYSTEM_PROMPT = """You are an expert technical curriculum designer. A learner just took a \
checkpoint quiz and scored poorly on specific topics within one milestone of their existing roadmap.

Your job is ONLY to design a short remediation topic for each weak topic listed — extra, more \
targeted practice the learner should do BEFORE returning to the original topic. You are not \
redesigning the milestone or the roadmap as a whole; only producing these remediation topics.

Rules:
1. Produce exactly one remediation topic per weak topic listed, in the same order.
2. Each remediation topic needs: a short concrete title that makes clear it's remediation/practice \
(e.g. "Recursion Fundamentals — Extra Practice"), a 1-2 sentence description of what specifically the \
learner will redo or drill, and a realistic estimated_hours (integer) — generally shorter than the \
original topic, since this is focused practice, not a full re-teach.
3. Directly address the quiz performance context given for each topic — don't produce generic filler.
4. Do not reference topics outside the ones listed.

Output ONLY the following, with nothing before or after it — no preamble, no closing remarks:

<REMEDIATION_TOPICS>
[
  {"title": "...", "description": "...", "estimated_hours": <int>}
]
</REMEDIATION_TOPICS>
"""


def build_remediation_user_prompt(milestone_title: str, weak_topics: list[dict]) -> str:
    """
    weak_topics: list of {"title", "description", "quiz_score_percent"} dicts,
    in the exact order remediation topics should come back in.
    """
    lines = []
    for wt in weak_topics:
        lines.append(
            f"- Topic: \"{wt['title']}\"\n"
            f"  Original description: {wt['description']}\n"
            f"  Quiz score on this topic: {wt['quiz_score_percent']:.0f}%"
        )
    weak_block = "\n".join(lines)
    return (
        f"Milestone: \"{milestone_title}\"\n\n"
        f"Weak topics from this checkpoint quiz ({len(weak_topics)} total):\n{weak_block}\n\n"
        "Generate the remediation topics now, following the system instructions exactly, "
        "one per weak topic listed above, in the same order."
    )
