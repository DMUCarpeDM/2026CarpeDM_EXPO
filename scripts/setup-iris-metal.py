"""Mac Iris용 원본 정밀도 Metal 모델을 설치한다. 요청 중에는 다운로드하지 않는다."""
import platform
import sys
from pathlib import Path

if sys.platform != "darwin" or platform.machine() != "arm64":
    raise SystemExit("Apple Silicon Mac에서 실행하세요.")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "iris-runtime"))

from huggingface_hub import hf_hub_download
from services.voice_runtime.tts_metal import (
    METAL_MODEL_DIR, METAL_MODEL_FILES, METAL_MODEL_REPO, METAL_MODEL_REVISION,
)

for name in METAL_MODEL_FILES:
    path = hf_hub_download(METAL_MODEL_REPO, filename=name,
                           revision=METAL_MODEL_REVISION, cache_dir=METAL_MODEL_DIR)
    print(f"Metal model ready: {path}")
