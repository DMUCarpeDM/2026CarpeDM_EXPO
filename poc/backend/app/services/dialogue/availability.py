"""선택한 대화 모델의 시작 가능 여부를 확인한다."""
from typing import Final
from time import monotonic

import httpx

from app.core.config import settings

_PROBE_TIMEOUT_SEC: Final = 1.5
_VERTEX_PROBE_CACHE: dict = {}


def ollama_dialogue_ready() -> bool:
    """선택한 로컬 대화 모델이 실행 중인지 확인한다."""
    if settings.dialogue_provider != "ollama":
        return False
    try:
        response = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=_PROBE_TIMEOUT_SEC)
        response.raise_for_status()
        names = {model.get("name", "") for model in response.json().get("models", [])}
    except (httpx.HTTPError, AttributeError, TypeError, ValueError):
        return False
    selected = settings.ollama_model
    return selected in names or (":" not in selected and f"{selected}:latest" in names)


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


def gemini_dialogue_ready() -> bool:
    """Developer API는 모델 조회, GCP는 캐시된 짧은 생성으로 확인한다."""
    if settings.dialogue_provider != "gemini":
        return False
    from app.services.dialogue.gemini_provider import _call_gemini, _gemini_headers, _gemini_url
    from app.services.dialogue.openai_provider import DialogueGenerationError
    if settings.gemini_api_backend == "vertex":
        key = (settings.gemini_vertex_project, settings.gemini_model)
        cached = _VERTEX_PROBE_CACHE.get(key)
        if cached and monotonic() - cached[0] < (60 if cached[1] else 5):
            return cached[1]
        try:
            ready = bool(_call_gemini("Reply only OK.", "Connection check.", max_tokens=64, temperature=0))
        except DialogueGenerationError:
            ready = False
        _VERTEX_PROBE_CACHE.clear()
        _VERTEX_PROBE_CACHE[key] = (monotonic(), ready)
        return ready
    try:
        headers = _gemini_headers()
        url = _gemini_url(settings.gemini_model).removesuffix(":generateContent")
        response = httpx.get(
            url,
            headers=headers,
            timeout=_PROBE_TIMEOUT_SEC,
        )
        response.raise_for_status()
    except (httpx.HTTPError, DialogueGenerationError):
        return False
    return True


def dialogue_ready() -> bool:
    """선택한 대화 제공자가 새 시뮬레이션을 시작할 수 있는지 확인한다."""
    if settings.dialogue_provider == "gemini":
        return gemini_dialogue_ready()
    if settings.dialogue_provider == "openai":
        return openai_dialogue_ready()
    if settings.dialogue_provider == "ollama":
        return ollama_dialogue_ready()
    return False
