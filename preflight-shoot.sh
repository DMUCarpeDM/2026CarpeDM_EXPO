#!/usr/bin/env bash
# 시연 영상 촬영 직전 점검 — 실측으로 확인 가능한 항목만 검사하고 go/no-go를 낸다.
#   ./preflight-shoot.sh
# 카메라·마이크 권한, 조명, 어댑터처럼 사람이 눈으로 봐야 하는 항목은 마지막에 목록으로만 낸다.
# 대본: docs/demo-video-script.md
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=8001
MVP_PORT=5173
DB="$ROOT/poc/backend/mirror-ting.db"

FAIL=0
WARN=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=$((WARN + 1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

head_ "1. 백엔드 (포트 $BACKEND_PORT)"
HEALTH="$(curl -s --max-time 5 "http://127.0.0.1:$BACKEND_PORT/api/health" || true)"
if [ -z "$HEALTH" ]; then
  bad "응답 없음 — 리포 루트에서 ./start-dev-mac.sh 실행"
else
  jqv() { printf '%s' "$HEALTH" | python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps(d$1))" 2>/dev/null; }
  [ "$(jqv "['degraded']")" = "false" ] && ok "degraded: false" || bad "degraded: true — $(jqv "['degraded_reasons']")"
  [ "$(jqv "['server_stt']")" = '"whisper"' ] \
    && ok "server_stt: whisper" \
    || bad "server_stt: $(jqv "['server_stt']") — 다른 워크트리(Python 3.14) 백엔드가 8001을 잡았을 수 있다"
  [ "$(jqv "['ollama']['dialogue']")" = "true" ] && ok "Ollama 대화 모델 준비" || bad "Ollama 대화 불가"
  [ "$(jqv "['semantic_match']")" = "true" ] && ok "의미 매칭 활성" || warn "의미 매칭 비활성 — 키워드 매칭으로 폴백"

  # 8001을 잡은 프로세스의 작업 디렉터리 — DB·설정의 실제 출처. 다른 워크트리의
  # 백엔드면 그쪽 빈 DB를 보므로 기록·비교 화면이 텅 빈다(문서화된 함정).
  PID="$(lsof -nP -iTCP:$BACKEND_PORT -sTCP:LISTEN -t 2>/dev/null | head -1)"
  if [ -n "$PID" ]; then
    CWD="$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | tail -1)"
    if [ "$CWD" = "$ROOT/poc/backend" ]; then
      ok "이 체크아웃의 백엔드 (pid $PID)"
    else
      warn "다른 체크아웃의 백엔드가 8001 점유: $CWD (pid $PID)"
      warn "  → 아래 DB 점검은 그쪽 DB 기준이다. 의도한 게 아니면 종료 후 ./start-dev-mac.sh"
    fi
    [ -f "$CWD/mirror-ting.db" ] && DB="$CWD/mirror-ting.db"

    # 설정 변경 후 재기동했는가 (프로세스가 config.py보다 나중에 떴는지)
    if [ -f "$CWD/app/core/config.py" ]; then
      CFG_T=$(stat -f %m "$CWD/app/core/config.py")
      PS_T=$(ps -p "$PID" -o lstart= 2>/dev/null | xargs -I{} date -j -f "%a %b %d %T %Y" "{}" +%s 2>/dev/null)
      if [ -n "${PS_T:-}" ] && [ "$PS_T" -lt "$CFG_T" ]; then
        warn "config.py가 백엔드 기동 이후 수정됨 — 설정 반영하려면 재기동 필요"
      fi
    fi
  fi
fi

head_ "2. 전시 화면 (포트 $MVP_PORT)"
if curl -s --max-time 5 -o /dev/null -w '' "http://127.0.0.1:$MVP_PORT/" 2>/dev/null; then
  ok "mvp 응답"
  ok "촬영용 주소: http://localhost:$MVP_PORT/?idle=0  ← 리포트 방치 복귀 끔"
else
  bad "mvp 무응답 — ./start-dev-mac.sh 실행"
fi

head_ "3. Ollama 모델 적재 (첫 턴 콜드스타트 방지)"
PS_JSON="$(curl -s --max-time 5 http://127.0.0.1:11434/api/ps || true)"
if printf '%s' "$PS_JSON" | grep -q "exaone"; then
  ok "exaone3.5 메모리 적재됨"
else
  warn "exaone 미적재 — 첫 질문이 10초 이상 걸릴 수 있다. 워밍업 1턴을 먼저 돌릴 것"
fi

head_ "4. 비교 화면 (S12) — 추이 곡선 조건"
if [ -f "$DB" ]; then
  python3 - "$DB" <<'PY'
import re
import sqlite3
import sys

db = sqlite3.connect(sys.argv[1])
rows = db.execute("""
    select s.client_key, count(*) from reports r
    join roleplay_sessions s on r.session_id = s.id
    where s.client_key not like 'demo-%'
    group by 1 order by 2 desc limit 8
""").fetchall()
# 브라우저 프로필만 센다 — pocApi가 crypto.randomUUID()로 만들므로 UUID 형태다.
# e2e-*/probe-* 같은 API 프로브 키는 localStorage에 없어 비교 화면에 안 잡힌다.
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
browser = [(k, n) for k, n in rows if UUID.match(k or "")]
best = max((n for _, n in browser), default=0)
if best >= 2:
    print(f"  \033[32m✓\033[0m 브라우저 프로필 중 완주 2회 이상 있음 (최다 {best}회)")
else:
    print("  \033[33m!\033[0m 완주 2회 이상인 브라우저 프로필이 없다 — 추이 곡선이 안 그려진다.")
    print("      촬영 전 같은 크롬 프로필로 1회 완주해 둘 것 (localStorage의 client_key 유지)")
for k, n in rows:
    tag = "브라우저" if UUID.match(k or "") else "프로브"
    print(f"      {k[:24]:24s} {n}회  ({tag})")
ver = db.execute("select engine_version, count(*) from reports group by 1").fetchall()
print(f"  \033[33m!\033[0m 백분위 배지: engine_version별 표본 {dict(ver)} — 현재 산식(v4) 표본 5건 미만이면 '상위 N%'는 안 뜬다(정상)")
PY
else
  bad "DB 없음: $DB"
fi

head_ "5. 녹화 여유 공간"
AVAIL=$(df -g "$HOME" | awk 'NR==2{print $4}')
[ "${AVAIL:-0}" -ge 20 ] && ok "여유 ${AVAIL}GB" || warn "여유 ${AVAIL}GB — 4K 화면 녹화는 분당 약 1GB"

head_ "사람이 직접 확인 (자동 점검 불가)"
cat <<'TXT'
  □ 전원 어댑터 연결 (2018 인텔 맥북 발열)
  □ 크롬에서 localhost:5173 카메라·마이크 권한 허용 — 내장 FaceTime HD 선택
     (아이폰 연속성 카메라가 먼저 잡히면 주소창 권한에서 변경)
  □ 집중 모드 ON · Dock 자동 숨김 · 불필요한 앱 종료
  □ ⌘⇧5 → 옵션: 마이크 ON, 부동 섬네일 끄기, 타이머 5초
  □ 정면 조명 · 카메라와 1~1.5m · 어깨까지 프레임에
TXT

printf '\n\033[1m판정:\033[0m '
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31mNO-GO — 실패 %d건\033[0m (경고 %d건)\n' "$FAIL" "$WARN"; exit 1
fi
printf '\033[32mGO\033[0m (경고 %d건 — 위 내용 확인 후 촬영)\n' "$WARN"
