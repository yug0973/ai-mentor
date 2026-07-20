# Prompt templates for checkpoint quiz generation. Same versioned-prompt
# convention as app/interview/prompts.py and app/roadmap/prompts.py.

PROMPT_VERSION = "quiz_v1"

QUIZ_SYSTEM_PROMPT = """You are an expert technical assessor writing a checkpoint quiz for a \
learner who just finished a milestone in their personalized course. You will be given a list of \
topics (with id, title, description) that make up this milestone.

Your job: write exactly ONE multiple-choice question PER topic given, testing genuine \
understanding of THAT topic specifically.

Rules:
1. Each question must be answerable only by someone who actually understood the specific topic — \
reference concrete concepts, syntax, tool behavior, or a realistic scenario from that topic's own \
subject matter. A question that could be copy-pasted onto any other topic and still make sense is \
a FAILURE — do not write generic "which of these is best practice" questions.
2. Exactly 4 answer options per question. Exactly one is correct.
3. The 3 wrong options (distractors) must be plausible — real misconceptions or subtly incorrect \
answers someone who half-understood the topic might pick — not absurd or obviously-wrong filler.
4. Vary which option index (0-3) is correct across the questions in this quiz. Do not put the \
correct answer in the same position every time.
5. Match question difficulty to current_level and to that specific topic's own scope — a topic \
with a small estimated_hours gets a more basic question than one with a large estimated_hours.
6. Every topic given to you must get exactly one question, referencing its exact topic_id.

Output ONLY the following, with nothing before or after it — no preamble, no closing remarks:

<QUIZ>
[
  {"topic_id": "...", "question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0}
]
</QUIZ>
"""


def build_quiz_user_prompt(current_level: str, topics: list) -> str:
    topics_block = "\n".join(
        f"- topic_id: {t.topic_id}\n  title: {t.title}\n  description: {t.description}\n"
        f"  estimated_hours: {t.estimated_hours}"
        for t in topics
    )
    return (
        f"Learner's current_level: {current_level}\n\n"
        f"Topics in this milestone (write exactly one question per topic_id below):\n{topics_block}\n\n"
        "Generate the quiz now, following the system instructions exactly."
    )
