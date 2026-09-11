"""간투어 분석용 Whisper small 모델을 프로젝트 내부에 준비한다."""
from pathlib import Path
from faster_whisper.utils import download_model

DEST = Path(__file__).resolve().parents[1] / "whisper-models" / "small"

if __name__ == "__main__":
    download_model("small", output_dir=str(DEST))
    print(f"완료. .env에 설정하세요: MIRROR_TING_STT_WHISPER_MODEL={DEST}")
