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
    Path("test_mirroting.db").unlink(missing_ok=True)
