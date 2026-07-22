from fastapi import APIRouter
from app.config import settings
from app.metrics import record_event
from app.models import ChatRequest, ChatResponse
from app.mock_data import mock_chat_reply
from app.chat.generator import chat_generator
from app.chat.remediation import (
    generate_remediation_topics,
    splice_remediation_into_roadmap,
    RemediationError,
)

router = APIRouter(prefix="/chat", tags=["Ongoing Mentor Chat"])


@router.post("/respond", response_model=ChatResponse)
def respond(payload: ChatRequest):
    if settings.MOCK_LLM:
        record_event("chat_responded", mode="mock_llm_setting", user_id=payload.user_id)
        return ChatResponse(reply=mock_chat_reply(payload.message))

    result = chat_generator.generate(payload)

    if result.diagnosis and payload.roadmap is not None:
        topic_id = result.diagnosis.get("topic_id")
        milestone_id = result.diagnosis.get("milestone_id")
        problem_summary = result.diagnosis.get("problem_summary", "")

        topic_title = None
        for m in payload.roadmap.milestones:
            if m.milestone_id != milestone_id:
                continue
            for t in m.topics:
                if t.topic_id == topic_id:
                    topic_title = t.title

        if topic_title:
            try:
                new_topics = generate_remediation_topics(topic_title, problem_summary)
                updated_roadmap, added = splice_remediation_into_roadmap(
                    payload.roadmap, milestone_id, topic_id, new_topics
                )
                if added:
                    record_event(
                        "chat_remediation_added", user_id=payload.user_id,
                        topic_id=topic_id, added_count=added,
                    )
                    milestone_title = next(
                        (m.title for m in updated_roadmap.milestones if m.milestone_id == milestone_id),
                        "your roadmap",
                    )
                    confirmation = (
                        f"\n\nI've added {added} focused topic"
                        f"{'s' if added != 1 else ''} under '{milestone_title}' to help with "
                        "that — check your roadmap."
                    )
                    return ChatResponse(
                        reply=result.reply + confirmation,
                        changed=True,
                        change_summary=f"Added {added} remedial topic(s) for '{topic_title}'.",
                        updated_roadmap=updated_roadmap,
                    )
            except RemediationError:
                record_event(
                    "chat_remediation_fallback", user_id=payload.user_id, topic_id=topic_id
                )
                pass

    return ChatResponse(reply=result.reply)