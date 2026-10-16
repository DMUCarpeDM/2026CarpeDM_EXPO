"""Chat Completions SSE transport. Preserve generated text without rewriting it."""
import json

import httpx

from app.core.config import settings


def stream_actor_text(system, prompt, *, max_tokens, temperature):
    from app.services.dialogue.openai_provider import DialogueGenerationError
    key = settings.openai_api_key.get_secret_value()
    if not key:
        raise DialogueGenerationError("GPT-4o API 키가 설정되지 않았습니다")
    try:
        with httpx.stream(
            "POST", f"{settings.openai_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": settings.openai_model, "messages": [
                {"role": "system", "content": system}, {"role": "user", "content": prompt}],
                "temperature": temperature, "max_tokens": max_tokens, "stream": True},
            timeout=settings.openai_timeout_sec,
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                event = json.loads(data)
                if event.get("error"):
                    raise DialogueGenerationError("GPT-4o 스트리밍 응답 오류")
                for choice in event.get("choices", []):
                    text = choice.get("delta", {}).get("content")
                    if text:
                        yield text
        raise DialogueGenerationError("GPT-4o 스트리밍 응답이 중단됐습니다")
    except DialogueGenerationError:
        raise
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as error:
        raise DialogueGenerationError("GPT-4o 역할극 응답을 만들지 못했습니다") from error
