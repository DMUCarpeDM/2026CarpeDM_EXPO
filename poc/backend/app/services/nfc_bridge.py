"""NFC 리더 브리지 (S-B2B-NFC) — PC/SC(ACR122U) 폴링 → 태그 이벤트 메모리 큐.

하드웨어 결정(docs/plan/b2b/hardware-nfc-decision.md): ACR122U 2대.
Windows 브라우저에는 Web NFC가 없으므로 백엔드가 PC/SC로 리더를 폴링하고,
프론트(키오스크·미러)는 GET /api/nfc/tap을 폴링해 마지막 태그를 받아간다.

폴백 계층 (핵심 설계 원칙 2 준수):
- pyscard 미설치 / 리더 미연결 → 브리지는 조용히 쉬고, 수동 카드 선택 버튼과
  POST /api/nfc/simulate-tap(로컬 전용)이 같은 이벤트 경로를 채운다.
- 리더 역할은 연결 순서(인덱스)로 배정한다: MIRROR_TING_NFC_READER_ROLES="mirror,kiosk"
  (리더 1대 운영이면 "mirror" 하나만 — 발급은 키오스크 화면의 수동 UID 입력 폴백).
"""
import threading
import time

_lock = threading.Lock()
# reader_role → {"uid", "at", "seq"} — seq는 전역 단조 증가 (프론트 폴링 커서).
# 기동 시각(epoch 초)으로 시드해 백엔드 재시작 후에도 이전 프로세스의 커서보다
# 항상 크게 유지한다 — 0부터 다시 세면 장수명 폴링 페이지가 조용히 먹통이 된다.
_taps: dict[str, dict] = {}
_seq = int(time.time())
_status: dict = {"running": False, "readers": [], "error": ""}

# 같은 카드를 리더에 올려둔 동안 이벤트가 연사되지 않게 하는 디바운스 (초)
_DEBOUNCE_SEC = 2.0
_POLL_INTERVAL_SEC = 0.4
# ACR122U 표준 UID 조회 APDU (PC/SC 2.01: FF CA 00 00 00)
_GET_UID_APDU = [0xFF, 0xCA, 0x00, 0x00, 0x00]


def record_tap(uid: str, reader: str) -> dict:
    """태그 이벤트 기록 — 실물 리더와 시뮬레이터(수동/테스트)가 같은 경로를 쓴다."""
    global _seq
    normalized = uid.replace(":", "").replace("-", "").upper()
    with _lock:
        _seq += 1
        tap = {"uid": normalized, "reader": reader, "at": time.time(), "seq": _seq}
        _taps[reader] = tap
        return dict(tap)


def latest_tap(reader: str, since: int = 0) -> dict | None:
    """since(이전에 본 seq) 이후의 새 태그만 돌려준다 — 없으면 None."""
    with _lock:
        tap = _taps.get(reader)
        if tap is None:
            return None
        # 스테일 커서 감지: since가 현재 발급 최대치(_seq)보다 크면 재시작 이전
        # 프로세스의 커서다 — 무시하고 현재 태그를 돌려준다 (장수명 키오스크/미러
        # 페이지가 재시작 후 조용히 먹통이 되는 것을 막는다).
        if since < tap["seq"] or since > _seq:
            return dict(tap)
        return None


def recent_tap_matches(uid: str, max_age_sec: float = 120.0) -> bool:
    """이 uid가 최근 실물 리더(또는 운영 가드 뒤의 시뮬레이터)에 태그됐는지.

    세션 생성의 기관 스탬프 증거로 쓴다 — 카드 UID는 비밀이 아니므로
    (휴대폰으로 읽힘) UID 지식만으로 기관 귀속을 인정하면 안 된다.
    """
    normalized = uid.replace(":", "").replace("-", "").upper()
    now = time.time()
    with _lock:
        return any(
            tap["uid"] == normalized and now - tap["at"] <= max_age_sec
            for tap in _taps.values()
        )


def bridge_status() -> dict:
    with _lock:
        return dict(_status)


def _set_status(**kwargs) -> None:
    with _lock:
        _status.update(kwargs)


def _poll_loop(role_by_index: list[str]) -> None:
    """PC/SC 리더 폴링 루프 — 데몬 스레드. 예외는 상태로만 남기고 죽지 않는다."""
    try:
        from smartcard.Exceptions import CardConnectionException, NoCardException
        from smartcard.System import readers as pcsc_readers
    except ImportError:
        _set_status(running=False, error="pyscard 미설치 — 수동 폴백만 사용")
        return

    _set_status(running=True, error="")
    last_uid: dict[str, tuple[str, float]] = {}  # role → (uid, at) 디바운스
    while True:
        try:
            readers = pcsc_readers()
        except Exception as exc:  # PC/SC 서비스 중지 등
            _set_status(readers=[], error=f"PC/SC 접근 불가: {exc}")
            time.sleep(2.0)
            continue
        _set_status(readers=[str(r) for r in readers], error="")
        for index, reader in enumerate(readers[: len(role_by_index)]):
            role = role_by_index[index]
            try:
                conn = reader.createConnection()
                conn.connect()
                data, sw1, sw2 = conn.transmit(_GET_UID_APDU)
                conn.disconnect()
            except (NoCardException, CardConnectionException):
                continue  # 카드 없음 — 정상
            except Exception:
                continue  # 일시적 리더 오류 — 다음 폴링에서 재시도
            if (sw1, sw2) != (0x90, 0x00) or not data:
                continue
            uid = "".join(f"{b:02X}" for b in data)
            prev_uid, prev_at = last_uid.get(role, ("", 0.0))
            now = time.time()
            if uid == prev_uid and now - prev_at < _DEBOUNCE_SEC:
                last_uid[role] = (uid, now)  # 올려둔 동안 디바운스 창 연장
                continue
            last_uid[role] = (uid, now)
            record_tap(uid, role)
        time.sleep(_POLL_INTERVAL_SEC)


def start_bridge() -> None:
    """서버 기동 시 1회 호출 — 설정이 꺼져 있으면 아무것도 하지 않는다."""
    from app.core.config import settings

    if not settings.nfc_bridge_enabled:
        _set_status(running=False, error="브리지 비활성(MIRROR_TING_NFC_BRIDGE_ENABLED=false)")
        return
    roles = [r.strip() for r in settings.nfc_reader_roles.split(",") if r.strip()]
    if not roles:
        roles = ["mirror"]
    threading.Thread(target=_poll_loop, args=(roles,), daemon=True).start()
