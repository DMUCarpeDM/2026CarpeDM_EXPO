import os
import sys
from pathlib import Path

# 테스트 전용 DB로 격리 (app 모듈 import 전에 설정해야 함)
os.environ["MIRROR_TING_DATABASE_URL"] = "sqlite:///./test_mirror-ting.db"
# 판정 결정성: 테스트는 키워드 매칭 계약을 고정한다 — 개발 머신에 Ollama가
# 떠 있어도 의미 매칭이 골든 셋 판정을 흔들지 않게 (라이브 검증은 별도 skipif)
os.environ["MIRROR_TING_SEMANTIC_MATCH_ENABLED"] = "false"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _remove_test_db():
    """테스트 DB 파일 제거 — 최선 노력(정리 실패로 세션을 깨뜨리지 않는다)."""
    for suffix in ("", "-wal", "-shm"):  # WAL 모드 부속 파일 포함
        try:
            Path(f"test_mirror-ting.db{suffix}").unlink(missing_ok=True)
        except PermissionError:
            pass  # Windows: 아직 열려 있는 파일은 지울 수 없다 (WinError 32)


# 앞선 실행이 중단되면(수집 오류·Ctrl-C) 종료 정리가 돌지 않아 DB가 남고, 다음
# 실행이 시드 중복(UNIQUE constraint failed: institutions.code)으로 깨진다.
# app 모듈 import 전 — 즉 엔진이 파일을 열기 전 — 이 시점에 지워야 Windows에서도
# 확실히 지워진다. 픽스처(세션 스코프)는 이미 import가 끝난 뒤라 늦다.
_remove_test_db()

import pytest  # noqa: E402


@pytest.fixture
def ready_ollama(monkeypatch):
    """세션 API 테스트용 역할극 응답. 실제 GPT-4o 호출은 하지 않는다."""
    from app.services.dialogue.base import QuestionSpec
    from app.services.dialogue.openai_provider import OpenAIDialogueProvider

    monkeypatch.setattr(
        OpenAIDialogueProvider,
        "next_question",
        lambda _self, _session, _scenario, _episodes, turns: QuestionSpec(
            episode_id=turns[-1].episode_id,
            question_type="ai_roleplay",
            question_text="말씀하신 내용을 확인했습니다. 이어서 설명해 주시겠어요?",
            character_id=turns[-1].character_id,
        ),
    )


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield
    # 커넥션 풀을 먼저 닫는다 — Windows는 열려 있는 파일을 지울 수 없다.
    # POSIX는 열린 파일도 unlink되므로 이 단계 없이도 통과해 왔다.
    from app.core.database import engine

    engine.dispose()
    _remove_test_db()
