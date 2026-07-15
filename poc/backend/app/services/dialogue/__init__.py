from app.core.config import settings
from app.services.dialogue.base import DialogueProvider, QuestionSpec
from app.services.dialogue.ollama_provider import OllamaDialogueProvider
from app.services.dialogue.template_provider import TemplateDialogueProvider, provider


def get_dialogue_provider() -> DialogueProvider:
    if settings.dialogue_provider == "ollama":
        return OllamaDialogueProvider(fallback=provider)
    return provider


__all__ = [
    "DialogueProvider",
    "OllamaDialogueProvider",
    "QuestionSpec",
    "TemplateDialogueProvider",
    "get_dialogue_provider",
    "provider",
]
