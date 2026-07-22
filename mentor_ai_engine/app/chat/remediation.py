"""
Chat-triggered remediation — extends Phase 4's "small targeted LLM call
generates new topic content, code splices it into the roadmap" pattern
(see app/adaptive/engine.py) to a trigger that comes from an ongoing chat
conversation instead of a checkpoint quiz score.
"""
import json
import re
import uuid

from app.llm_client import llm_client
from app.models import Roadmap, RoadmapTopic

REMEDIATION_BLOCK_RE = re.compile(r"<REMEDIATION_TOPICS>(.*?)</REMEDIATION_TOPICS>", re.DOTALL)
CODE_FENCE_RE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)

MAX_PARSE_RETRIES = 1

REMEDIATION_SYSTEM_PROMPT = """You are an expert curriculum designer. A learner is stuck on a \
specific topic in their learning roadmap. Given the topic they're stuck on and a summary of \
exactly what's confusing them, generate 1 to 3 new, focused remedial topics that fill that \
specific gap — not a re-explanation of the same topic, but the prerequisite or supporting \
concepts that would make the original topic click.

Return ONLY a JSON array wrapped in <REMEDIATION_TOPICS></REMEDIATION_TOPICS> tags, no other \
text. Each item: {"title": str, "description": str, "estimated_hours": int (1-6)}."""


class RemediationError(Exception):
    pass


def _strip_code_fences(text: str) -> str:
    return CODE_FENCE_RE.sub("", text).strip()


def _extract_topics(raw_reply: str) -> list | None:
    match = REMEDIATION_BLOCK_RE.search(raw_reply)
    if not match:
        return None
    json_str = _strip_code_fences(match.group(1).strip())
    try:
        data = json.loads(json_str)
        return data if isinstance(data, list) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _build_user_prompt(topic_title: str, problem_summary: str) -> str:
    return (
        f"Topic the learner is stuck on: {topic_title}\n"
        f"What's confusing them (from the conversation): {problem_summary}\n\n"
        "Generate the remedial topics now."
    )


def generate_remediation_topics(topic_title: str, problem_summary: str) -> list[dict]:
    messages = [
        {"role": "system", "content": REMEDIATION_SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_prompt(topic_title, problem_summary)},
    ]

    reply = llm_client.chat(messages, temperature=0.5, max_tokens=600)
    topics = _extract_topics(reply)

    retries = 0
    while topics is None and retries < MAX_PARSE_RETRIES:
        retries += 1
        messages.append({"role": "assistant", "content": reply})
        messages.append({
            "role": "user",
            "content": "That wasn't valid JSON in the required tags. Return ONLY the "
                       "<REMEDIATION_TOPICS>[...]</REMEDIATION_TOPICS> block, nothing else.",
        })
        reply = llm_client.chat(messages, temperature=0.3, max_tokens=600)
        topics = _extract_topics(reply)

    if topics is None:
        raise RemediationError("LLM never returned a parseable remediation topic list")

    return topics


def splice_remediation_into_roadmap(
    roadmap: Roadmap, milestone_id: str, topic_id: str, new_topics: list[dict]
) -> tuple[Roadmap, int]:
    added = 0
    for milestone in roadmap.milestones:
        if milestone.milestone_id != milestone_id:
            continue
        insert_at = next(
            (i for i, t in enumerate(milestone.topics) if t.topic_id == topic_id), None
        )
        if insert_at is None:
            continue

        flagged_status = milestone.topics[insert_at].status
        unlock_now = flagged_status == "completed"

        spliced = []
        for item in new_topics:
            spliced.append(
                RoadmapTopic(
                    topic_id=f"remedial-{uuid.uuid4().hex[:8]}",
                    title=item.get("title", "Remedial topic"),
                    description=item.get("description", ""),
                    estimated_hours=int(item.get("estimated_hours", 2)),
                    status="available" if unlock_now else "locked",
                    prerequisites=[topic_id],
                )
            )
        milestone.topics[insert_at + 1:insert_at + 1] = spliced
        added = len(spliced)
        break

    total = sum(len(m.topics) for m in roadmap.milestones)
    completed = sum(
        1 for m in roadmap.milestones for t in m.topics if t.status == "completed"
    )
    roadmap.progress_percent = round((completed / total) * 100, 1) if total else 0.0

    return roadmap, added