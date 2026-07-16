#!/usr/bin/env bash
# 미러팅 전시 원커맨드 실행기 — 분석 서버(poc/backend) + 전시 프론트(mvp 프로덕션 빌드)
#
#   bash scripts/expo_start.sh           # 준비(필요 시) → 백엔드 → 프론트 → 상태 출력 → 브라우저
#   bash scripts/expo_start.sh status    # 실행 상태만 확인
#   bash scripts/expo_start.sh stop      # 이 스크립트가 띄운 프로세스 중지
#
# 환경변수:
#   BACKEND_PORT (기본 8001)  FRONT_PORT (기본 5173)
#   SKIP_BUILD=1  프론트 빌드 생략(이전 빌드 재사용)   NO_OPEN=1  브라우저 자동 열기 생략
#
# 최초 실행 시 poc/backend/scripts/setup_ai.sh 가 자동으로 돌며(수 분 소요)
# Python 3.12 venv·whisper·Vosk·Ollama 모델을 준비해요. 이후 실행은 수 초면 끝나요.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/poc/backend"
MVP_DIR="$ROOT/mvp"
RUN_DIR="$ROOT/.expo-run"
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONT_PORT="${FRONT_PORT:-5173}"
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/api/health"
FRONT_URL="http://localhost:${FRONT_PORT}"

log() { printf '\033[1;34m[expo]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[expo] %s\033[0m\n' "$*" >&2; exit 1; }

health_json() { curl -sf -m 3 "$HEALTH_URL" 2>/dev/null; }
health_ok() { health_json | grep -q '"ok":true'; }
front_up() { curl -sf -m 3 -o /dev/null "$FRONT_URL"; }

print_health() {
  local body; body="$(health_json || true)"
  if [ -z "$body" ]; then
    log "분석 서버: 미연결 ($HEALTH_URL)"
    return 1
  fi
  log "분석 서버: 연결됨 — $(echo "$body" | tr -d '{}"' | tr ',' ' ' | cut -c1-140)"
  if echo "$body" | grep -q '"degraded":true'; then
    log "⚠ 일부 기능 제한(degraded) — 위 응답의 degraded_reasons 확인"
  fi
}

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_one() { # $1=pid파일 $2=이름
  if alive "$1"; then
    kill "$(cat "$1")" 2>/dev/null || true
    log "$2 중지 (pid $(cat "$1"))"
  fi
  rm -f "$1"
}

case "${1:-start}" in
  status)
    print_health || true
    if front_up; then log "전시 프론트: $FRONT_URL 응답 정상"; else log "전시 프론트: 미실행"; fi
    exit 0
    ;;
  stop)
    stop_one "$RUN_DIR/front.pid" "전시 프론트"
    stop_one "$RUN_DIR/backend.pid" "분석 서버"
    # pid 파일이 어긋났을 때를 대비해 우리 포트의 리스너도 정리해요(전시 PC 단독 운영 전제).
    for port in "$FRONT_PORT" "$BACKEND_PORT"; do
      pids="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
      if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; log ":$port 리스너 정리 (pid $pids)"; fi
    done
    exit 0
    ;;
  start) ;;
  *) fail "사용법: expo_start.sh [start|status|stop]" ;;
esac

mkdir -p "$RUN_DIR"

# ── 1. 분석 서버 ──────────────────────────────────────────────
if health_ok; then
  log "분석 서버가 이미 :$BACKEND_PORT 에서 응답 중 — 그대로 사용해요."
else
  if lsof -nP -iTCP:"$BACKEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail ":$BACKEND_PORT 를 다른 프로세스가 쓰고 있는데 /api/health 가 응답하지 않아요. 해당 프로세스를 정리하거나 BACKEND_PORT 를 바꿔 주세요."
  fi
  if [ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]; then
    log "백엔드 venv가 없어 최초 준비를 시작해요 (setup_ai.sh, 수 분 소요)…"
    (cd "$BACKEND_DIR" && bash scripts/setup_ai.sh)
  fi
  log "분석 서버 기동 → :$BACKEND_PORT (로그: .expo-run/backend.log)"
  (cd "$BACKEND_DIR" && nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" \
      >>"$RUN_DIR/backend.log" 2>&1 & echo $! >"$RUN_DIR/backend.pid")
  for _ in $(seq 1 60); do health_ok && break; sleep 1; done
  health_ok || fail "분석 서버가 60초 안에 준비되지 않았어요 — .expo-run/backend.log 확인"
fi
print_health

# ── 2. 전시 프론트 (프로덕션 빌드) ────────────────────────────
cd "$MVP_DIR"
if [ ! -d node_modules ]; then
  log "프론트 의존성 설치(npm ci)…"
  npm ci --no-audit --no-fund
fi
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  log "프론트 프로덕션 빌드…"
  npm run build
fi
if front_up; then
  log "전시 프론트가 이미 :$FRONT_PORT 에서 응답 중 — 그대로 사용해요."
else
  if lsof -nP -iTCP:"$FRONT_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail ":$FRONT_PORT 를 다른 프로세스가 쓰고 있어요. 정리하거나 FRONT_PORT 를 바꿔 주세요."
  fi
  log "전시 프론트 기동 → $FRONT_URL (로그: .expo-run/front.log)"
  # npm run 래퍼 대신 vite를 직접 실행해야 stop 시 자식 프로세스가 남지 않아요.
  (MIRRORTING_API_TARGET="http://127.0.0.1:${BACKEND_PORT}" nohup node_modules/.bin/vite preview --host 0.0.0.0 --port "$FRONT_PORT" --strictPort \
      >>"$RUN_DIR/front.log" 2>&1 & echo $! >"$RUN_DIR/front.pid")
  for _ in $(seq 1 30); do front_up && break; sleep 1; done
  front_up || fail "전시 프론트가 30초 안에 준비되지 않았어요 — .expo-run/front.log 확인"
fi

# ── 3. 연결 체인 검증 (프론트 프록시 → 백엔드) ────────────────
if curl -sf -m 3 "$FRONT_URL/api/health" | grep -q '"ok":true'; then
  log "프록시 체인 정상: $FRONT_URL/api → :$BACKEND_PORT"
else
  fail "프론트는 떴지만 /api 프록시가 백엔드에 닿지 않아요 — MIRRORTING_API_TARGET·포트 설정 확인"
fi

log "준비 완료 → $FRONT_URL (카메라·마이크 권한 허용 필요)"
if [ "${NO_OPEN:-0}" != "1" ] && [ "$(uname)" = "Darwin" ]; then open "$FRONT_URL"; fi
