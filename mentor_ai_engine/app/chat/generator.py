import json
import re

from app.chat.prompts import CHAT_SYSTEM_PROMPT, build_context_block
from app.llm_client import llm_client
from app.metrics import record_event
from app.models import ChatRequest
from app.roadmap.prompts import render_profile_summary

MAX_HISTORY_TURNS = 12

STRUGGLE_DIAGNOSIS_RE = re.compile(r"<STRUGGLE_DIAGNOSIS>(.*?)</STRUGGLE_DIAGNOSIS>", re.DOTALL)


def _render_roadmap_summary(roadmap) -> str:
    if roadmap is None:
        return "No roadmap generated yet — the learner is still pre-roadmap."

    lines = [f"- goal: {roadmap.goal}", f"- overall progress: {roadmap.progress_percent:.0f}%"]
    for m in roadmap.milestones:
        completed = sum(1 for t in m.topics if t.status == "completed")
        lines.append(f"- milestone '{m.title}' (milestone_id={m.milestone_id}): {completed}/{len(m.topics)} topics completed")
        for t in m.topics:
            lines.append(f"    - topic '{t.title}' (topic_id={t.topic_id}): status={t.status}")
    return "\n".join(lines)


def _render_mastery_summary(mastery_scores) -> str:
    if not mastery_scores:
        return "No mastery data recorded yet."
    return "\n".join(
        f"- topic {m.topic_id}: {m.mastery_score:.0%} mastery (last updated {m.last_updated})"
        for m in mastery_scores
    )


class ChatResult:
    def __init__(self, reply: str, diagnosis: dict | None):
        self.reply = reply
        self.diagnosis = diagnosis


class ChatGenerator:
    def generate(self, req: ChatRequest) -> ChatResult:
        context_block = build_context_block(
            profile_summary=render_profile_summary(req.learner_profile),
            roadmap_summary=_render_roadmap_summary(req.roadmap),
            mastery_summary=_render_mastery_summary(req.mastery_scores),
        )

        messages = [{"role": "system", "content": f"{CHAT_SYSTEM_PROMPT}\n\n{context_block}"}]

        for turn in req.conversation_history[-MAX_HISTORY_TURNS:]:
            messages.append({
                "role": "user" if turn.role == "user" else "assistant",
                "content": turn.content,
            })

        messages.append({"role": "user", "content": req.message})

        raw_reply = llm_client.chat(messages, temperature=0.7, max_tokens=500).strip()
        record_event("chat_responded", mode="real", user_id=req.user_id)

        diagnosis = None
        match = STRUGGLE_DIAGNOSIS_RE.search(raw_reply)
        visible_reply = raw_reply
        if match:
            visible_reply = STRUGGLE_DIAGNOSIS_RE.sub("", raw_reply).strip()
            try:
                diagnosis = json.loads(match.group(1).strip())
            except (json.JSONDecodeError, TypeError):
                diagnosis = None

        return ChatResult(reply=visible_reply, diagnosis=diagnosis)


chat_generator = ChatGenerator()