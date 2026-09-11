#!/usr/bin/env bash
# 로컬 AI 스택 원커맨드 셋업 — 팀원 온보딩/전시 PC 준비용 (멱등, API 키 불필요).
#
#   cd backend && bash scripts/setup_ai.sh
#
# 하는 일:
#   1. uv 설치 → Python 3.12 venv (.venv) + 의존성 + faster-whisper
#   2. Whisper 간투어 모델 로컬 준비
#   3. Ollama + exaone3.5:2.4b(대화 개인화). 의미 매칭은 프로젝트의 local E5 사용
#      — EXAONE은 q8_0 KV 캐시와 비호환이라 f16을 강제한 LaunchAgent로 기동
#   4. .env 생성 (없을 때만) — 대화 엔진 ollama 활성화
set -euo pipefail
cd "$(dirname "$0")/.."   # backend/

echo "== [1/4] Python 3.12 venv =="
if ! command -v uv >/dev/null && [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
"$UV" python install 3.12
if [ ! -x .venv/bin/python ] || ! .venv/bin/python -c 'import sys; sys.exit(sys.version_info[:2] != (3, 12))' 2>/dev/null; then
  rm -rf .venv && "$UV" venv .venv --python 3.12
fi
"$UV" pip install --python .venv -r requirements.txt faster-whisper

echo "== [2/4] Whisper 모델 사전 다운로드 =="
.venv/bin/python scripts/setup_offline_stt.py

echo "== [3/4] Ollama + 한국어 모델 =="
if ! command -v ollama >/dev/null; then
  if command -v brew >/dev/null; then brew install ollama; else
    echo "!! brew가 없습니다 — https://ollama.com 에서 설치 후 재실행"; exit 1
  fi
fi
PLIST="$HOME/Library/LaunchAgents/com.mirror-ting.ollama.plist"
if [ ! -f "$PLIST" ]; then
  brew services stop ollama >/dev/null 2>&1 || true
  cat > "$PLIST" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.mirror-ting.ollama</string>
    <key>ProgramArguments</key>
    <array><string>/usr/local/bin/ollama</string><string>serve</string></array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OLLAMA_KV_CACHE_TYPE</key><string>f16</string>
        <key>OLLAMA_FLASH_ATTENTION</key><string>0</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/mirror-ting-ollama.log</string>
    <key>StandardErrorPath</key><string>/tmp/mirror-ting-ollama.log</string>
</dict>
</plist>
EOF
  # ollama 실행 경로가 /usr/local/bin이 아니면 보정 (Apple Silicon: /opt/homebrew/bin)
  OLLAMA_BIN="$(command -v ollama)"
  [ "$OLLAMA_BIN" != "/usr/local/bin/ollama" ] && sed -i '' "s|/usr/local/bin/ollama|$OLLAMA_BIN|" "$PLIST"
  launchctl bootout "gui/$(id -u)/com.mirror-ting.ollama" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  sleep 4
fi
for i in $(seq 1 15); do
  curl -s --max-time 2 http://localhost:11434/api/version >/dev/null && break
  sleep 2
done
ollama pull exaone3.5:2.4b

echo "== [4/4] .env =="
[ -f .env ] || printf '# 기준 문서: .env.example\nMIRROR_TING_DIALOGUE_PROVIDER=ollama\nMIRROR_TING_SEMANTIC_PROVIDER=local_e5\n' > .env

echo
echo "완료. 확인:  .venv/bin/uvicorn app.main:app --reload  →  GET /api/health"
echo '기대값: {"server_stt": "whisper", "dialogue_provider": "ollama"}'
