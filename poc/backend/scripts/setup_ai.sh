#!/usr/bin/env bash
# 로컬 AI 스택 원커맨드 셋업 — 팀원 온보딩/전시 PC 준비용 (멱등, API 키 불필요).
#
#   cd backend && bash scripts/setup_ai.sh
#
# 하는 일:
#   1. uv 설치 → Python 3.12 venv (.venv) + 의존성 + faster-whisper
#   2. Whisper 한국어 모델 사전 다운로드 (전시장 오프라인 대비)
#   3. Vosk 한국어 모델 다운로드 (완전 오프라인 STT 폴백)
#   4. Ollama + exaone3.5:2.4b(대화 개인화) + bge-m3(의미 매칭 임베딩)
#      — EXAONE은 q8_0 KV 캐시와 비호환이라 f16을 강제한 LaunchAgent로 기동
#   5. .env 생성 (없을 때만) — 대화 엔진 ollama 활성화
set -euo pipefail
cd "$(dirname "$0")/.."   # backend/

# 3·4단계(Vosk 폴백·Ollama 개인화)는 실패해도 서버가 폴백으로 돌 수 있어
# 경고만 남기고 계속 진행해요. 1·2단계(venv·whisper)는 필수라 실패 시 중단.
WARNINGS=()
warn() { echo "!! $1" >&2; WARNINGS+=("$1"); }

echo "== [1/5] Python 3.12 venv =="
if ! command -v uv >/dev/null && [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
"$UV" python install 3.12
if [ ! -x .venv/bin/python ] || ! .venv/bin/python -c 'import sys; sys.exit(sys.version_info[:2] != (3, 12))' 2>/dev/null; then
  rm -rf .venv && "$UV" venv .venv --python 3.12
fi
"$UV" pip install --python .venv -r requirements.txt faster-whisper

echo "== [2/5] Whisper 모델 사전 다운로드 =="
MODEL="${MIRROTING_STT_WHISPER_MODEL:-small}"
.venv/bin/python - "$MODEL" <<'PY'
import sys
from faster_whisper import WhisperModel
WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
print(f"whisper-{sys.argv[1]} 캐시 완료")
PY

echo "== [3/5] Vosk 한국어 모델 =="
if ! .venv/bin/python scripts/setup_offline_stt.py; then
  warn "Vosk 모델 다운로드 실패 — 완전 오프라인 STT 폴백 없이 진행해요(주 STT인 whisper는 정상). 네트워크 연결 후 재실행하면 채워져요."
fi

echo "== [4/5] Ollama + 한국어 모델 =="
OLLAMA_READY=1
if ! command -v ollama >/dev/null; then
  if command -v brew >/dev/null; then
    brew install ollama || { warn "Ollama 설치 실패 — 대화는 템플릿 폴백으로 동작해요."; OLLAMA_READY=0; }
  else
    warn "brew가 없어 Ollama를 건너뛰어요 — 대화는 템플릿 폴백으로 동작해요. https://ollama.com 설치 후 재실행하면 개인화가 켜져요."
    OLLAMA_READY=0
  fi
fi
if [ "$OLLAMA_READY" = "1" ]; then
PLIST="$HOME/Library/LaunchAgents/com.mirroting.ollama.plist"
if [ "$OLLAMA_READY" = "1" ] && [ ! -f "$PLIST" ]; then
  brew services stop ollama >/dev/null 2>&1 || true
  cat > "$PLIST" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.mirroting.ollama</string>
    <key>ProgramArguments</key>
    <array><string>/usr/local/bin/ollama</string><string>serve</string></array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OLLAMA_KV_CACHE_TYPE</key><string>f16</string>
        <key>OLLAMA_FLASH_ATTENTION</key><string>0</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/mirroting-ollama.log</string>
    <key>StandardErrorPath</key><string>/tmp/mirroting-ollama.log</string>
</dict>
</plist>
EOF
  # ollama 실행 경로가 /usr/local/bin이 아니면 보정 (Apple Silicon: /opt/homebrew/bin)
  OLLAMA_BIN="$(command -v ollama)"
  [ "$OLLAMA_BIN" != "/usr/local/bin/ollama" ] && sed -i '' "s|/usr/local/bin/ollama|$OLLAMA_BIN|" "$PLIST"
  launchctl bootout "gui/$(id -u)/com.mirroting.ollama" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  sleep 4
fi
for i in $(seq 1 15); do
  curl -s --max-time 2 http://localhost:11434/api/version >/dev/null && break
  sleep 2
done
ollama pull exaone3.5:2.4b || warn "exaone3.5:2.4b 풀 실패 — 대화는 템플릿 폴백으로 동작해요."
ollama pull bge-m3 || warn "bge-m3 풀 실패 — 의미 매칭이 키워드 폴백으로 동작해요."
fi

echo "== [5/5] .env =="
[ -f .env ] || printf '# 기준 문서: .env.example\nMIRROTING_DIALOGUE_PROVIDER=ollama\n' > .env

echo
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "완료(경고 ${#WARNINGS[@]}건 — 위 '!!' 항목 참고). 필수 스택(whisper·서버)은 준비됐어요."
else
  echo "완료. 확인:  .venv/bin/uvicorn app.main:app --reload  →  GET /api/health"
  echo '기대값: {"server_stt": "whisper", "dialogue_provider": "ollama"}'
fi
