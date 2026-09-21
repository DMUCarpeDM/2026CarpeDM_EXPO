from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.openai_provider import DialogueGenerationError, OpenAIDialogueProvider
from app.core.config import settings


def get_dialogue_provider():
    """설정에 따라 Gemini 또는 GPT-4o 대화 제공자를 반환한다."""
    if settings.dialogue_provider == "gemini":
        from app.services.dialogue.gemini_provider import GeminiDialogueProvider

        return GeminiDialogueProvider()
    return OpenAIDialogueProvider()


__all__ = [
    "DialogueGenerationError",
    "OpenAIDialogueProvider",
    "QuestionSpec",
    "get_dialogue_provider",
]
