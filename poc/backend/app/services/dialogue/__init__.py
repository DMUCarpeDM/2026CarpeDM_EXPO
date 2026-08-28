from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.openai_provider import DialogueGenerationError, OpenAIDialogueProvider


def get_dialogue_provider() -> OpenAIDialogueProvider:
    """역할극 대사는 GPT-4o만 생성한다. 템플릿 폴백은 사용하지 않는다."""
    return OpenAIDialogueProvider()


__all__ = [
    "DialogueGenerationError",
    "OpenAIDialogueProvider",
    "QuestionSpec",
    "get_dialogue_provider",
]
