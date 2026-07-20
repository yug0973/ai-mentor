import json
import re
from app.llm_client import llm_client
from app.interview.prompts import INTERVIEW_SYSTEM_PROMPT, INTERVIEW_OPENING_MESSAGE
from app.models import LearnerProfile

PROFILE_BLOCK_RE = re.compile(r"<PROFILE_COMPLETE>(.*?)</PROFILE_COMPLETE>", re.DOTALL)

MAX_TURNS = 10  # hard safety cap so a misbehaving model can't loop forever

# A normal interview follow-up question is one to three sentences. If the
# model drifts off-script and writes something essay-length instead of
# either a short question or a proper <PROFILE_COMPLETE> block — e.g. it
# decides it has enough info and just writes out a full multi-week roadmap
# as prose — that reply must NOT be displayed to the learner as if it were
# a normal question. This threshold is deliberately generous (a genuinely
# long, detailed question could reach a few hundred characters) while
# still catching anything roadmap/essay-shaped.
MAX_QUESTION_LENGTH = 500
MARKDOWN_HEADER_RE = re.compile(r"^#{1,6}\s", re.MULTILINE)


def _looks_like_misfired_completion(raw_reply: str) -> bool:
    if len(raw_reply) > MAX_QUESTION_LENGTH:
        return True
    if len(MARKDOWN_HEADER_RE.findall(raw_reply)) >= 2:
        return True  # multiple markdown headers = structured content, not a question
    return False


class InterviewSession:
    """
    Holds the conversation history for one learner's intake interview
    and drives it turn by turn. In-memory for Phase 1 — the backend team
    should persist `history` + `status` if sessions need to survive a restart.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.status = "in_progress"  # "in_progress" | "complete"
        self.learner_profile: LearnerProfile | None = None
        self.turn_count = 0
        self.history: list[dict] = [
            {"role": "system", "content": INTERVIEW_SYSTEM_PROMPT},
        ]

    def start(self) -> str:
        """Kick off the interview with a fixed, friendly opening line (no LLM call needed —
        saves a request and guarantees a good first impression every time)."""
        self.history.append({"role": "assistant", "content": INTERVIEW_OPENING_MESSAGE})
        return INTERVIEW_OPENING_MESSAGE

    def submit_answer(self, user_message: str) -> dict:
        """
        Feed the learner's answer to the model, get back either the next
        question or a completed profile.
        Returns: {"status": "in_progress", "message": str}
              or {"status": "complete", "profile": LearnerProfile}
        """
        self.history.append({"role": "user", "content": user_message})
        self.turn_count += 1

        # Safety valve: force completion if the interview runs too long
        force_finish = self.turn_count >= MAX_TURNS
        messages = self.history.copy()
        if force_finish:
            messages.append({
                "role": "system",
                "content": (
                    "You have asked enough questions. Fill in any missing fields with your "
                    "best reasonable estimate based on the conversation so far and output the "
                    "<PROFILE_COMPLETE> block now."
                ),
            })

        # max_tokens was 600 — too tight once the model adds any preamble
        # before the <PROFILE_COMPLETE> block, which truncates the JSON
        # before its closing tag and silently breaks extraction (observed
        # in real Gemini output, not just a theoretical risk). 1200 gives
        # enough headroom for preamble + the full profile JSON.
        raw_reply = llm_client.chat(messages, temperature=0.6, max_tokens=1200)
        self.history.append({"role": "assistant", "content": raw_reply})

        profile, parse_error = self._try_extract_profile(raw_reply)
        if profile is not None:
            self.status = "complete"
            self.learner_profile = profile
            return {"status": "complete", "profile": profile}

        if parse_error is not None:
            # The comment here used to claim a retry nudge was added for the
            # next turn — it never actually was. This is that nudge, now
            # real: tell the model its last attempt was malformed/truncated
            # so it doesn't just repeat the same mistake, and don't leak the
            # broken partial JSON block to the learner as if it were a
            # normal question.
            self.history.append({
                "role": "system",
                "content": (
                    "Your previous <PROFILE_COMPLETE> block failed to parse "
                    f"({parse_error}). If you are finishing the interview, output ONLY a "
                    "single, complete, valid <PROFILE_COMPLETE>...</PROFILE_COMPLETE> block "
                    "with nothing before or after it, and make sure the JSON is fully closed. "
                    "Otherwise, just continue with your next interview question as normal."
                ),
            })
            return {
                "status": "in_progress",
                "message": "Sorry, could you say a bit more about that?",
            }

        if _looks_like_misfired_completion(raw_reply):
            # No <PROFILE_COMPLETE> tag at all, but this also isn't a normal
            # short question — the model wrote something essay/roadmap-shaped
            # instead of following the format. Same recovery pattern as a
            # parse error: nudge it back on script, don't show the raw
            # output to the learner.
            print(f"[interview] Misfired completion detected (not tagged, but not a normal question either). Raw reply:\n{raw_reply}")
            self.history.append({
                "role": "system",
                "content": (
                    "Your previous reply did not follow the required format — it should have "
                    "been either ONE short interview follow-up question, or a proper "
                    "<PROFILE_COMPLETE>...</PROFILE_COMPLETE> block if you have enough "
                    "information to finish. Do not write out the roadmap, a plan, or any "
                    "long-form content directly in the chat — that happens in a separate step "
                    "after the interview. If you have enough information now, output ONLY the "
                    "<PROFILE_COMPLETE> block. Otherwise, ask ONE short follow-up question."
                ),
            })
            return {
                "status": "in_progress",
                "message": "Sorry, could you say a bit more about that?",
            }

        return {"status": "in_progress", "message": raw_reply.strip()}

    @staticmethod
    def _try_extract_profile(raw_reply: str) -> tuple[LearnerProfile | None, str | None]:
        """
        Returns (profile, parse_error). parse_error is non-None only when the
        model clearly attempted a completion (an opening <PROFILE_COMPLETE>
        tag is present) but it didn't parse — as opposed to a normal
        in-progress question, where neither tag is expected.
        """
        match = PROFILE_BLOCK_RE.search(raw_reply)
        if not match:
            if "<PROFILE_COMPLETE>" in raw_reply:
                # Opening tag present, no closing tag — almost always a
                # truncated/cut-off generation.
                return None, "opening <PROFILE_COMPLETE> tag found but no closing tag (likely truncated)"
            return None, None
        json_str = match.group(1).strip()
        try:
            data = json.loads(json_str)
            return LearnerProfile(**data), None
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            print(f"[interview] Failed to parse profile JSON: {e}\nRaw block: {json_str}")
            return None, str(e)
