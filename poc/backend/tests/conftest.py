import os
import sys
from pathlib import Path

# 테스트 전용 DB로 격리 (app 모듈 import 전에 설정해야 함)
os.environ["MIRROTING_DATABASE_URL"] = "sqlite:///./test_mirroting.db"
# 판정 결정성: 테스트는 키워드 매칭 계약을 고정한다 — 개발 머신에 Ollama가
# 떠 있어도 의미 매칭이 골든 셋 판정을 흔들지 않게 (라이브 검증은 별도 skipif)
os.environ["MIRROTING_SEMANTIC_MATCH_ENABLED"] = "false"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest


@pytest.fixture
def ready_ollama(monkeypatch):
    """세션 API 테스트용 로컬 Ollama 준비 상태. 실제 네트워크 호출은 하지 않는다."""
    from app.api import sessions
    from app.core.config import settings
    from app.services.dialogue.ollama_provider import OllamaDialogueProvider

    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    monkeypatch.setattr(sessions, "ollama_dialogue_ready", lambda: True)
    monkeypatch.setattr(
        OllamaDialogueProvider,
        "personalize_question",
        lambda _self, spec, *_args, **_kwargs: spec.question_text,
    )


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield
    for suffix in ("", "-wal", "-shm"):  # WAL 모드 부속 파일 포함
        Path(f"test_mirroting.db{suffix}").unlink(missing_ok=True)
