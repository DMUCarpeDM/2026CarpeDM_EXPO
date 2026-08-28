"""선택한 대화 모델의 시작 가능 여부를 확인한다."""
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


def openai_dialogue_ready() -> bool:
    """서버 환경변수의 OpenAI 키로 GPT-4o 접근 가능 여부를 확인한다."""
    if settings.dialogue_provider != "openai":
        return False
    api_key = settings.openai_api_key.get_secret_value()
    if not api_key:
        return False
    try:
        response = httpx.get(
            f"{settings.openai_base_url}/models/{settings.openai_model}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=_PROBE_TIMEOUT_SEC,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return False
    return True


def dialogue_ready() -> bool:
    """GPT-4o 역할극 대화가 새 시뮬레이션을 시작할 수 있는지 확인한다."""
    return openai_dialogue_ready()
