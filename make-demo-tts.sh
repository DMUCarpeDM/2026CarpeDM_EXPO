#!/usr/bin/env bash
# 시연 영상 후반 더빙용 TTS 일괄 생성 — 맥 내장 `say`만 쓴다(설치·계정 불필요).
#
#   ./make-demo-tts.sh 대사.txt [출력폴더]
#
# 대사.txt = 한 줄에 대사 하나. 촬영본 화면에서 AI 질문/리액션을 그대로 받아 적으면 된다
# (시나리오 1은 LLM이 답변에 맞춰 문장을 다듬으므로 테이크마다 달라 사전 제작이 불가능하다).
#
# 왜 더빙이 맞아떨어지는가 (2026-08-01 실측):
#   화면의 발화 애니메이션은 브라우저 speechSynthesis의 onend에서 끝난다(PracticePage.jsx).
#   맥 크롬이 고르는 한국어 음성이 '유나'라 `say -v Yuna`와 같은 목소리·같은 길이다 —
#   30자 문장에서 브라우저 3.66s vs say 3.62s (차이 1%).
#   ※ `글자수 × 150ms`는 발화 길이가 아니라 onend가 안 올 때를 대비한 **폴백 상한**이다
#     (74자면 11.1s). 실제 발화보다 훨씬 길어 평소엔 발동하지 않는다.
#   ※ 발화 시작까지 약 1초의 합성 지연이 있다(onstart 1.01s 실측) — 더빙은 애니메이션
#     시작 지점이 아니라 그 1초 뒤에 얹는다.
set -uo pipefail

SRC="${1:-}"
OUT="${2:-tts-out}"
VOICE="${VOICE:-Yuna}"   # VOICE=Sandy ./make-demo-tts.sh … 로 교체 가능
RATE="${RATE:-}"         # RATE=180 이면 say -r 180

if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "사용법: ./make-demo-tts.sh 대사.txt [출력폴더]" >&2
  echo "  한 줄에 대사 하나. 목소리 목록: say -v '?' | grep ko_KR" >&2
  exit 1
fi
command -v say >/dev/null || { echo "say 명령을 찾을 수 없다 (macOS 전용)" >&2; exit 1; }

mkdir -p "$OUT"
i=0
warned=0
printf '%-4s %-6s %-10s %-8s %s\n' "#" "글자" "폴백상한" "TTS" "판정"
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  i=$((i + 1))
  f="$OUT/$(printf '%02d' "$i").aiff"

  if [ -n "$RATE" ]; then say -v "$VOICE" -r "$RATE" -o "$f" "$line"
  else say -v "$VOICE" -o "$f" "$line"; fi

  # 글자수는 공백 제외 — 코드의 text.length는 공백을 포함하지만, 한국어 문장에서
  # 공백 비중이 낮아 판정에 큰 차이가 없다. 여기서는 코드와 같게 공백 포함으로 센다.
  chars=${#line}
  anim=$(python3 -c "print(min(12.0, max(3.0, $chars * 0.150)))")
  tts=$(python3 -c "
import subprocess, sys
out = subprocess.run(['afinfo', '$f'], capture_output=True, text=True).stdout
for l in out.splitlines():
    if 'estimated duration' in l:
        print(f\"{float(l.split(':')[1].split()[0]):.2f}\"); break
else:
    print('0')
")
  # 화면 발화는 같은 유나 음성이라 길이가 거의 같다 — 남는 위험은 '폴백 상한이 먼저
  # 끊는 경우'뿐이다(합성 지연 1초 + 발화가 상한을 넘길 때).
  over=$(python3 -c "print('1' if $tts + 1.0 > $anim else '0')")
  if [ "$over" = "1" ]; then
    verdict="⚠ 폴백 상한(${anim}s)에 근접 — 화면이 먼저 멈출 수 있다. 문장을 줄이거나 자막 처리"
    warned=$((warned + 1))
  else
    verdict="✓ 화면 발화와 동일 음성 — 애니메이션 시작 +1.0s 지점에 얹으면 맞는다"
  fi
  printf '%-4s %-6s %-10s %-8s %s\n' "$i" "$chars" "${anim}s" "${tts}s" "$verdict"
done < "$SRC"

echo
echo "생성 완료: $OUT/ ($i개, 목소리 $VOICE)"
[ "$warned" -gt 0 ] && echo "⚠ 애니메이션보다 긴 대사 $warned건 — 그 컷은 PiP를 화면 밖으로 빼거나 자막으로 처리한다"
echo "편집 순서: 녹화본 마이크 트랙을 가이드로 발화 구간 표시 → 각 구간 시작 +1.0s에 aiff 얹기 → 가이드 음소거 → 내레이션 믹스"
exit 0
