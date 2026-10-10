"""Real synthesis check. Run as the same Windows user as Iris and the backend."""
import argparse
import io
import json
from pathlib import Path
import time
import urllib.request
import wave

parser = argparse.ArgumentParser()
parser.add_argument("--backend", help="Optional backend URL, e.g. http://127.0.0.1:8001")
parser.add_argument("--timeout", type=float, default=180)
args = parser.parse_args()
base = "http://127.0.0.1:18765"

def request(url, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=args.timeout) as response:
        return response.read()

health = json.loads(request(base + "/health"))
if health.get("status") != "ok" or health.get("mock_mode") is not False:
    raise SystemExit("Iris is offline or in mock mode; no real voice verified.")
profile = json.loads(request(base + "/v1/voice/profile"))
if not profile.get("available"):
    raise SystemExit("Voice profile missing.")
text = "안녕하세요. 스마트 미러 음성 출력 테스트입니다."
start = time.monotonic()
result = json.loads(request(base + "/v1/audio/speech", {"text": text, "voice_prompt_hash": ""}))
path = Path(result["audio_path"]).resolve()
allowed = (Path.home() / ".iris-light" / "audio").resolve()
if path.suffix.lower() != ".wav" or not path.is_relative_to(allowed):
    raise SystemExit("Unexpected audio path; must be under current user's .iris-light/audio.")

def check_wav(data):
    with wave.open(io.BytesIO(data), "rb") as wav:
        raw = wav.readframes(wav.getnframes())
        if wav.getsampwidth() != 2 or not raw or not any(raw):
            raise SystemExit("Empty/silent or unexpected WAV; real voice not verified.")
        return wav.getnframes() / wav.getframerate()

seconds = check_wav(path.read_bytes())
print(json.dumps({"model": profile.get("model_name"), "synthesis_seconds": round(time.monotonic()-start, 2), "audio_seconds": round(seconds, 2), "audio_path": str(path)}, ensure_ascii=False, indent=2))
if args.backend:
    check_wav(request(args.backend.rstrip("/") + "/api/tts", {"text": text, "voice": "female"}))
    print("Backend /api/tts returned non-silent WAV.")
print("Listen to the WAV and test a new sentence in Chrome; this check cannot verify speaker output.")
