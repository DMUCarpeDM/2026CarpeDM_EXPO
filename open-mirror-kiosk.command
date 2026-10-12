#!/usr/bin/env bash
# 서버 실행 후 더블클릭. 다른 포트는 첫 인자로 URL을 전달한다.
set -euo pipefail
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
URL="${1:-http://127.0.0.1:8772/?mirror=1&service=workplace}"
if [[ ! -x "$CHROME" ]]; then
  echo 'Google Chrome을 설치해 주세요.' >&2
  exit 1
fi
# 기존 일반 Chrome 창과 분리해야 --kiosk가 적용된다.
exec "$CHROME" --kiosk --no-first-run --user-data-dir="$HOME/Library/Application Support/MirrorTing-Kiosk" "$URL"
