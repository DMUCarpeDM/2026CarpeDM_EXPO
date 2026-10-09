"""로컬 Ollama 대화 제공자가 EXAONE 채팅 API로 한 줄을 받는다."""
import httpx

from app.core.config import settings
from app.services.dialogue.ollama_provider import OllamaDialogueProvider


def test_ollama_complete_posts_installed_model(monkeypatch):
    captured = {}

    class _Response:
        status_code = 200
        text = ""

        def json(self):
            return {"message": {"content": "그래서 담당이랑 마감만 말해요."}}

    def _post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        return _Response()

    monkeypatch.setattr(settings, "ollama_model", "exaone3.5:2.4b")
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:11434")
    monkeypatch.setattr(httpx, "post", _post)

    line = OllamaDialogueProvider()._complete("시스템", "사용자", max_tokens=512, temperature=0.4)

    assert line == "그래서 담당이랑 마감만 말해요."
    assert captured["url"] == "http://127.0.0.1:11434/api/chat"
    assert captured["json"]["model"] == "exaone3.5:2.4b"
    assert captured["json"]["options"]["num_predict"] == 180
    assert "format" not in captured["json"]
