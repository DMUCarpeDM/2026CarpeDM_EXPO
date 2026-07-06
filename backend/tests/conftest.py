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


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield
    Path("test_mirroting.db").unlink(missing_ok=True)
