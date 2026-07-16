#!/usr/bin/env python3
"""감열 프린터 브링업 — 프린터가 도착한 날 이 스크립트 하나로 확인한다.

사용법 (poc/backend에서):
  .venv/bin/python scripts/print_receipt_test.py                 # 파일로만 (미리보기 PNG)
  .venv/bin/python scripts/print_receipt_test.py --port /dev/tty.usbserial-0001
  .venv/bin/python scripts/print_receipt_test.py --port COM3 --baud 19200

포트 찾기:
  macOS  : ls /dev/tty.usbserial* /dev/tty.wchusbserial*
  Windows: 장치 관리자 → 포트(COM & LPT) → USB-SERIAL CH340
  Linux  : ls /dev/ttyUSB*

인쇄가 안 될 때 체크리스트는 poc/docs/receipt-printer.md 참고.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.services.receipt import ReceiptData, print_receipt  # noqa: E402

SAMPLE = ReceiptData(
    total_score=88.0,
    fit_scores={
        "response": {"score": 86}, "voice": {"score": 82},
        "eye": {"score": 78}, "posture": {"score": 91},
    },
    headline_sentence="결론을 먼저, 근거는 한 문장으로 요약하면 설득력이 올라가요.",
    scenario_title="서버 장애 보고",
    character_name="팀장 김민수",
    difficulty="pressure",
    mode=5,
    finished_label="브링업 테스트 카드",
    percentile_top=18,
    code="8324",
)


def main() -> int:
    parser = argparse.ArgumentParser(description="퇴근 카드 테스트 출력")
    parser.add_argument("--port", default="", help="시리얼 포트 (비우면 file 드라이버)")
    parser.add_argument("--baud", type=int, default=9600, help="보드레이트 (기본 9600)")
    args = parser.parse_args()

    if args.port:
        settings.receipt_driver = "serial"
        settings.receipt_serial_port = args.port
        settings.receipt_serial_baud = args.baud
        print(f"[receipt] serial → {args.port} @ {args.baud}")
    else:
        settings.receipt_driver = "file"
        print("[receipt] file 드라이버 — media/receipts에 PNG/bin 저장")

    result = print_receipt(SAMPLE)
    print(f"[receipt] ok={result.ok} driver={result.driver} {result.detail}")
    for f in result.files:
        print(f"[receipt]   {f}")
    if not result.ok:
        print("[receipt] 실패 — poc/docs/receipt-printer.md의 트러블슈팅을 확인하세요")
        return 1
    if args.port:
        print("[receipt] 카드가 나왔다면 브링업 완료! 안 나왔다면: 전원(별도 5-9V) → 보드레이트(9600↔19200) → TX/RX 스왑 순으로 확인")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
