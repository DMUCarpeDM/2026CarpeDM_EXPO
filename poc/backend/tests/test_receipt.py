"""퇴근 카드(감열 영수증) — 렌더링·ESC/POS 변환·API 보호 검증.

프린터 하드웨어 없이 전 경로를 검증한다: 렌더러는 순수 PIL이고, file 드라이버는
PNG(미리보기)와 ESC/POS 바이트를 파일로 남긴다. 시리얼 전송은 바이트 규격이 같으므로
여기서 검증한 payload가 곧 실기 출력물이다 (배선·전원만 실기기 주간에 확인).
"""
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import SessionLocal
from app.main import app
from app.models import Report, RoleplaySession, Scenario, SessionStatus
from app.seed.run import seed
from app.services.receipt import (
    RECEIPT_WIDTH,
    ReceiptData,
    image_to_escpos,
    print_receipt,
    render_receipt,
)

client = TestClient(app)

SAMPLE = ReceiptData(
    total_score=88.0,
    fit_scores={
        "response": {"score": 86, "summary": ""},
        "voice": {"score": 82, "summary": ""},
        "eye": {"score": 78, "summary": ""},
        "posture": {"score": 91, "summary": ""},
    },
    headline_sentence="결론을 먼저, 근거는 한 문장으로 요약하면 설득력이 올라가요.",
    scenario_title="서버 장애 보고",
    character_name="팀장 김민수",
    difficulty="pressure",
    mode=5,
    finished_label="2026.10.14 14:32",
    percentile_top=18,
    code="8324",
)


def test_render_receipt_is_printer_ready_bitmap():
    img = render_receipt(SAMPLE)
    assert img.mode == "1", "감열 래스터는 1비트여야 한다"
    assert img.width == RECEIPT_WIDTH, "58mm 인쇄폭(384dot) 고정"
    assert img.height > 500, "총점·4-Fit·한 문장·QR가 담기면 이보다 짧을 수 없다"


def test_render_receipt_survives_minimal_report():
    """폴백 안전성 — 헤드라인·코드·백분위가 없어도 카드는 나온다."""
    img = render_receipt(ReceiptData(total_score=55.0, fit_scores={}))
    assert img.mode == "1" and img.width == RECEIPT_WIDTH


def test_escpos_payload_structure():
    payload = image_to_escpos(render_receipt(SAMPLE))
    assert payload.startswith(b"\x1b@"), "ESC @ 초기화로 시작"
    assert b"\x1dv0\x00" in payload, "GS v 0 래스터 명령 포함"
    width_bytes = RECEIPT_WIDTH // 8
    first = payload.index(b"\x1dv0\x00") + 4
    xl, xh = payload[first], payload[first + 1]
    assert xl + (xh << 8) == width_bytes, "래스터 행 바이트 폭이 384dot과 일치"
    assert payload.rstrip(b"\x10BV\x1d").endswith(b"\x1bd\x04") or b"\x1bd" in payload


def test_file_driver_writes_preview_and_escpos(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "receipt_driver", "file")
    monkeypatch.setattr(settings, "media_dir", tmp_path)
    result = print_receipt(SAMPLE)
    assert result.ok and result.driver == "file"
    png, bin_ = (Path(f) for f in result.files)
    assert png.exists() and png.stat().st_size > 1000
    assert bin_.exists() and bin_.read_bytes().startswith(b"\x1b@")


def test_serial_driver_without_port_fails_clearly(monkeypatch):
    monkeypatch.setattr(settings, "receipt_driver", "serial")
    monkeypatch.setattr(settings, "receipt_serial_port", "")
    result = print_receipt(SAMPLE)
    assert not result.ok and "SERIAL_PORT" in result.detail


def _make_session(db, *, token: str, with_report: bool) -> int:
    scenario_id = db.query(Scenario).first().id
    session = RoleplaySession(
        scenario_id=scenario_id, client_key="receipt-test", mode=5,
        status=SessionStatus.completed, access_token=token,
    )
    db.add(session)
    db.flush()
    if with_report:
        db.add(Report(
            session_id=session.id, total_score=77.0,
            fit_scores={"response": {"score": 80}, "voice": {"score": 74}},
            headline={"sentence": "핵심을 먼저 말해 보세요."},
        ))
    db.commit()
    return session.id


def test_receipt_api_requires_session_token_and_returns_png(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "receipt_driver", "file")
    monkeypatch.setattr(settings, "media_dir", tmp_path)
    seed()
    db = SessionLocal()
    try:
        sid = _make_session(db, token="receipt-token", with_report=True)
        bare = _make_session(db, token="bare-token", with_report=False)
    finally:
        db.close()

    # 토큰 없이 → 403 (리포트와 동일한 IDOR 방어)
    assert client.get(f"/api/sessions/{sid}/receipt.png").status_code == 403

    r = client.get(
        f"/api/sessions/{sid}/receipt.png?code=1234",
        headers={"X-Session-Token": "receipt-token"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content.startswith(b"\x89PNG")

    # 리포트 없는 세션 → 404
    r = client.get(
        f"/api/sessions/{bare}/receipt.png",
        headers={"X-Session-Token": "bare-token"},
    )
    assert r.status_code == 404

    # 출력(file 드라이버) — 산출물 경로를 응답으로 돌려준다
    r = client.post(
        f"/api/sessions/{sid}/receipt/print",
        json={"code": "1234"},
        headers={"X-Session-Token": "receipt-token"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] and body["driver"] == "file" and len(body["files"]) == 2
