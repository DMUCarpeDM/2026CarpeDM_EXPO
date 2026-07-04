"""전시장 오프라인 STT 준비 — Vosk 한국어 모델(~82MB) 다운로드.

실행 (인터넷이 되는 곳에서 1회):
    cd backend && ./.venv/bin/python scripts/setup_offline_stt.py

이후 서버가 자동으로 Vosk를 감지해, 브라우저 음성 인식(Web Speech)이 안 되는
환경에서도 업로드된 음성을 서버에서 텍스트로 변환한다.
"""
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-ko-0.22.zip"
DEST = Path(__file__).resolve().parent.parent / "models" / "vosk-ko"


def main() -> None:
    if (DEST / "conf").exists() or (DEST / "am").exists():
        print(f"이미 준비됨: {DEST}")
        return
    DEST.parent.mkdir(parents=True, exist_ok=True)
    zip_path = DEST.parent / "vosk-ko.zip"

    print(f"다운로드 중: {MODEL_URL}")

    def progress(count, block, total):
        if total > 0:
            pct = min(100, count * block * 100 // total)
            sys.stdout.write(f"\r  {pct}% ({count * block // 1048576}MB/{total // 1048576}MB)")
            sys.stdout.flush()

    urllib.request.urlretrieve(MODEL_URL, zip_path, reporthook=progress)
    print("\n압축 해제 중…")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(DEST.parent)
    # vosk-model-small-ko-0.22/ → vosk-ko/ 로 정리
    extracted = DEST.parent / "vosk-model-small-ko-0.22"
    if extracted.exists():
        if DEST.exists():
            shutil.rmtree(DEST)
        extracted.rename(DEST)
    zip_path.unlink(missing_ok=True)
    print(f"완료 — 서버 재시작 시 자동 감지됩니다: {DEST}")


if __name__ == "__main__":
    main()
