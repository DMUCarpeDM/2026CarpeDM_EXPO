"""로컬 Ollama 대화 모델의 시작 가능 여부를 확인한다."""
from typing import Final

import httpx

from app.core.config import settings

_PROBE_TIMEOUT_SEC: Final = 1.5


def ollama_dialogue_ready() -> bool:
    """선택한 로컬 대화 모델이 실행 중인지 확인한다."""
    if settings.dialogue_provider != "ollama":
        return False
    try:
        response = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=_PROBE_TIMEOUT_SEC)
        response.raise_for_status()
    except httpx.HTTPError:
        return False
    names = {model.get("name", "") for model in response.json().get("models", [])}
    model_stem = settings.ollama_model.split(":")[0]
    return settings.ollama_model in names or model_stem in {name.split(":")[0] for name in names}
