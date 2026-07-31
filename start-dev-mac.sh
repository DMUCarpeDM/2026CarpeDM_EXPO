#!/usr/bin/env bash
# 맥 개발·데모 원커맨드 기동 — Ollama(LaunchAgent) → 백엔드 8001 → mvp 5173
# Windows 전시 PC는 start-exhibition.ps1 사용. Ctrl+C 한 번으로 전부 종료된다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

# 1) Ollama — EXAONE은 q8_0 KV 캐시 비호환이라 반드시 f16 강제 LaunchAgent로 기동
if ! curl -s --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null; then
  launchctl load ~/Library/LaunchAgents/com.mirroting.ollama.plist 2>/dev/null || true
  echo "[start] Ollama 기동 대기..."
  for _ in $(seq 1 15); do
    curl -s --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null && break
    sleep 1
  done
fi

# 2) 백엔드 8001 (poc/backend/.env + mirror-ting.db 기준 디렉터리 고정)
( cd "$ROOT/poc/backend" && exec ./.venv/bin/uvicorn app.main:app --port 8001 ) &
BACK=$!

# 3) 전시용 mvp 5173 (/api → 127.0.0.1:8001 프록시)
( cd "$ROOT/mvp" && exec npm run dev ) &
FRONT=$!

trap 'kill $BACK $FRONT 2>/dev/null' EXIT INT TERM
echo "[start] backend:8001 (pid $BACK) / mvp:5173 (pid $FRONT) — Ctrl+C로 전부 종료"
wait
