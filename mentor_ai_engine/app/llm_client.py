from openai import OpenAI
from app.config import settings


class LLMClient:
    """
    Thin wrapper so the rest of the codebase never talks to a specific
    provider's SDK directly. Swap Groq -> OpenAI -> local Ollama by only
    editing .env — nothing else in the codebase changes.
    """

    def __init__(self):
        self.client = OpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
            default_headers={
                "x-goog-api-key": settings.LLM_API_KEY,
            }
        )
        self.model = settings.LLM_MODEL

    def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 800,
        model: str | None = None,
    ) -> str:
        """
        messages: list of {"role": "system"|"user"|"assistant", "content": str}
        model: optional per-call override of the default model (e.g. Phase 5's
        Intent Parser uses a smaller/faster model than the default — see
        settings.INTENT_LLM_MODEL — since it's called on every learner message).
        Returns the raw text content of the model's reply.
        """
        response = self.client.chat.completions.create(
            model=model or self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content


llm_client = LLMClient()
