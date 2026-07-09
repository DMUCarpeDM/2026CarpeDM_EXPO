import os
import sys
from pathlib import Path

# 테스트 전용 DB로 격리 (app 모듈 import 전에 설정해야 함)
os.environ["MIRROTING_DATABASE_URL"] = "sqlite:///./test_mirroting.db"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield
    for suffix in ("", "-wal", "-shm"):  # WAL 모드 부속 파일 포함
        Path(f"test_mirroting.db{suffix}").unlink(missing_ok=True)
