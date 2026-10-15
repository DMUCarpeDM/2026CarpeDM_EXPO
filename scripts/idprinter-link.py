"""S-B2B-NFC: 두 기기의 사원증·미러 연결 설정과 읽기 전용 현장 점검.

실행: poc/backend/.venv/Scripts/python.exe scripts/idprinter-link.py --help
비밀은 화면/인자에 출력하지 않으며 카드 등록·세션 생성·인쇄는 하지 않는다.
"""
from __future__ import annotations

import argparse
import ipaddress
from io import StringIO
import os
from pathlib import Path
import secrets
import sys
from datetime import datetime
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "poc" / "backend"
sys.path.insert(0, str(BACKEND))

import httpx
from dotenv import dotenv_values
from dotenv.parser import parse_stream

from app.services.idprinter_bridge import BridgeError, IDPrinterBridge, _base_url
from app.services.nfc_bridge import contactless_readers


def lan_url(value: str) -> str:
    """다른 기기에서 도달할 수 없는 주소가 운영 설정에 들어가지 않게 한다."""
    try:
        normalized = _base_url(value.strip())
    except BridgeError as exc:
        raise ValueError("http(s)://IP:포트 형식의 서버 기본 주소가 필요합니다") from exc
    host = urlsplit(normalized).hostname.lower()
    if host == "localhost" or host.endswith(".localhost"):
        raise ValueError("서로 다른 기기는 localhost 대신 실제 LAN 주소를 사용해야 합니다")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return normalized
    if address.is_loopback or address.is_unspecified:
        raise ValueError("서로 다른 기기는 127.0.0.1/0.0.0.0 대신 실제 LAN 주소를 사용해야 합니다")
    return normalized


def configure(args) -> int:
    kiosk_url, mirror_url = lan_url(args.kiosk_url), lan_url(args.mirror_url)
    env_file = BACKEND / ".env"
    current = dotenv_values(env_file) if env_file.exists() else {}
    token = (args.token_file.read_text(encoding="utf-8").strip() if args.token_file
             else current.get("MIRROR_TING_IDPRINTER_BRIDGE_TOKEN") or secrets.token_urlsafe(32))
    if len(token) < 32 or not all(c.isascii() and (c.isalnum() or c in "_-.") for c in token):
        raise ValueError("공유 토큰은 영문·숫자·_-.로 구성된 32자 이상이어야 합니다")
    private = ROOT / ".local-setup" / "idprinter-link"
    private.mkdir(parents=True, exist_ok=True)
    # 기존 제공자/모델/API 키 설정을 보존한다. 백업도 Git 제외 위치에만 저장한다.
    if env_file.exists():
        backup = private / f"mirror-env-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.bak"
        backup.write_bytes(env_file.read_bytes())
    else:
        env_file.touch()
    updates = {
        "MIRROR_TING_IDPRINTER_BASE_URL": kiosk_url,
        "MIRROR_TING_IDPRINTER_BRIDGE_TOKEN": token,
        "MIRROR_TING_NFC_BRIDGE_ENABLED": "true",
        "MIRROR_TING_NFC_READER_ROLES": "mirror",
    }
    original = env_file.read_text(encoding="utf-8")
    lines, written = [], set()
    for binding in parse_stream(StringIO(original)):
        if binding.key in updates:
            if binding.key not in written:
                lines.append(f"{binding.key}={updates[binding.key]}\n")
                written.add(binding.key)
        else:
            lines.append(binding.original.string)
    merged = "".join(lines)
    if merged and not merged.endswith("\n"):
        merged += "\n"
    merged += "".join(f"{key}={value}\n" for key, value in updates.items() if key not in written)
    # Windows에서 dotenv의 임시 파일 replace가 ACL/바이러스 검사로 거부되는
    # 환경도 지원한다. 원본은 위에서 별도 백업한 뒤 한 번만 덮어쓴다.
    env_file.write_text(merged, encoding="utf-8")
    companion = private / "idprinter.env"
    companion.write_text(
        "# 기존 프린터 .env에 아래 항목만 병합하고 서버를 재시작하세요.\n"
        "# KIOSK_PRINT/장치 설정은 실제 프린터 설정을 유지합니다.\n"
        "KIOSK_HOST=0.0.0.0\n"
        f"KIOSK_PORT={urlsplit(kiosk_url).port or (443 if kiosk_url.startswith('https:') else 80)}\n"
        "KIOSK_NFC=pcsc\n"
        f"KIOSK_MIRRORTING_URL={mirror_url}\n"
        f"KIOSK_BRIDGE_TOKEN={token}\n", encoding="utf-8",
    )
    print("미러 .env 설정 완료. 프린터에 전달할 비공개 파일:", companion)
    print("프린터의 기존 .env에 병합한 뒤 양쪽 서버를 재시작하세요.")
    print("미러 Windows 실행: .\\start-exhibition.ps1 -PrinterLink")
    print("실제 NFC 태그·리포트 조회·종이 출력 검증은 아직 수행하지 않았습니다.")
    return 0


def check(args) -> int:
    values = {**dotenv_values(BACKEND / ".env"), **os.environ}
    url = (values.get("MIRROR_TING_IDPRINTER_BASE_URL") or "").strip()
    token = values.get("MIRROR_TING_IDPRINTER_BRIDGE_TOKEN") or ""
    passed = True
    try:
        from smartcard.System import readers
        devices = contactless_readers(readers())
        print("[NFC] 비접촉 리더:", ", ".join(map(str, devices)) or "없음")
        passed &= bool(devices)
    except Exception:
        print("[NFC] PC/SC 접근 불가 — pyscard/Smart Card 서비스/USB 연결 확인")
        passed = False
    # 실행 중인 서버가 설정 변경을 실제로 읽었는지 별도로 확인한다.
    headers = {"X-Admin-Token": values.get("MIRROR_TING_ADMIN_TOKEN") or ""}
    with httpx.Client(timeout=5, follow_redirects=False, trust_env=False) as client:
        try:
            response = client.get(_base_url(args.mirror_url) + "/api/nfc/status", headers=headers)
            response.raise_for_status()
            status = response.json()
            ready = (status.get("running") is True and bool(status.get("readers"))
                     and status.get("idprinter", {}).get("valid") is True)
            print("[미러 서버]", "NFC 실행·외부 사원증 설정 확인" if ready else "NFC/외부 사원증 설정 확인 필요 (서버 재시작 확인)")
            passed &= ready
        except (httpx.HTTPError, ValueError, BridgeError):
            print("[미러 서버] 점검 불가 — 서버 기동·/api/nfc/status·운영 인증 확인")
            passed = False
        if not url or len(token) < 32:
            print("[프린터 연결] 미설정 — configure로 실제 LAN 주소와 공유 토큰 설정 필요")
            return 1
        try:
            with IDPrinterBridge(url, token, client=client) as bridge:
                # 존재하지 않는 UID의 명시적 UNKNOWN_CARD도 인증된 경로 도달 증거다.
                uid = args.card_uid or "00000000"
                response = client.get(bridge.base_url + "/api/integrations/mirrorting/cards/" + uid,
                                      headers={"X-Bridge-Token": token})
                body = response.json()
                if not isinstance(body, dict):
                    raise ValueError("invalid response")
                error = body.get("error")
                if response.status_code == 404 and isinstance(error, dict) and error.get("code") == "UNKNOWN_CARD":
                    print("[프린터 연결] 서버 간 인증 정상 /", "이 카드는 미발급" if args.card_uid else "카드·출력은 미검증")
                    passed &= not bool(args.card_uid)
                elif response.status_code == 200:
                    bridge.resolve(uid)
                    print("[프린터 연결] 서버 간 인증·현재 사원증 방문 회차 확인")
                else:
                    print(f"[프린터 연결] HTTP {response.status_code} — 주소·공유 토큰·서버 바인딩 확인")
                    passed = False
        except (httpx.HTTPError, ValueError, BridgeError):
            print("[프린터 연결] 도달/계약 확인 실패 — LAN·방화벽·주소·토큰 확인")
            passed = False
    print("종이 출력과 프린터→미러 방향의 리포트 조회는 프린터 기기에서 별도 검증하세요.")
    return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    setup = commands.add_parser("configure", help="실제 LAN 주소로 양쪽 설정 준비 (미러 .env 수정)")
    setup.add_argument("--kiosk-url", required=True)
    setup.add_argument("--mirror-url", required=True)
    setup.add_argument("--token-file", type=Path, help="기존 공유 토큰 파일. 생략 시 기존 토큰 보존/새 토큰 생성")
    verify = commands.add_parser("check", help="설정·실행 중 미러·NFC 리더·프린터 인증 읽기 전용 점검")
    verify.add_argument("--mirror-url", default="http://127.0.0.1:8001")
    verify.add_argument("--card-uid", type=lambda value: value.replace(":", "").replace("-", "").upper())
    args = parser.parse_args()
    if args.command == "check" and args.card_uid:
        import re
        if not re.fullmatch(r"(?:[0-9A-F]{2}){2,16}", args.card_uid):
            parser.error("card-uid는 4~32자의 짝수 길이 16진수여야 합니다")
    try:
        return configure(args) if args.command == "configure" else check(args)
    except (ValueError, OSError) as error:
        # 예외 원문/파일 내용에는 비밀이 섞일 수 있으므로 제한된 안내만 출력한다.
        print(str(error) if isinstance(error, ValueError) else "설정 파일 접근 실패 — 경로와 쓰기 권한을 확인하세요.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
