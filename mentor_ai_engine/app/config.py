import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """
    Central config. Swappable LLM backend by design:
    - Default: Groq (free tier, OpenAI-compatible API, very fast)
    - Fallback: local Ollama (fully offline, zero cost, no API key)
    Any OpenAI-SDK-compatible provider works by just changing these three values.
    """

    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

    # Phase 5 (Intent Parser) runs on every learner message, so it needs to be
    # fast and cheap rather than high-reasoning — a smaller/faster Groq model
    # than the main LLM_MODEL used for interview/roadmap/adaptive generation.
    # Same provider, same LLMClient, just a per-call model override.
    INTENT_LLM_MODEL: str = os.getenv("INTENT_LLM_MODEL", "llama-3.1-8b-instant")

    ALLOWED_ORIGINS: list[str] = os.getenv("ALLOWED_ORIGINS", "*").split(",")

    # When true, skips real LLM calls entirely and uses a scripted interview
    # flow instead. Lets frontend build/test the full chat UI with ZERO API
    # key and zero network dependency. Set MOCK_LLM=true in .env.
    MOCK_LLM: bool = os.getenv("MOCK_LLM", "false").lower() == "true"


settings = Settings()
