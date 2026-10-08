"""Optional two-app contract. IDPRINTER_SOURCE selects an unchanged kiosk checkout.
No sockets, models, physical cards, physical printing, or paid AI are used.
"""
import os
import sys
from pathlib import Path
import pytest

source = os.environ.get("IDPRINTER_SOURCE")
if not source:
    pytest.skip("IDPRINTER_SOURCE required for optional companion test", allow_module_level=True)
sys.path.insert(0, str(Path(source).resolve()))
import httpx
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import SecretStr
import backend.app as printer
from backend.reports import fetch_mirrorting_report
from backend.store import KioskStore
from app.api import nfc, sessions
from app.core.config import settings
from app.main import app
from app.seed.run import seed
from app.services import nfc_bridge
from app.services.idprinter_bridge import IDPrinterBridge


def test_real_apps_link_report_retry_and_reissued_card(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "openai_api_key", SecretStr(""))
    monkeypatch.setattr(settings, "gemini_api_key", SecretStr(""))
    seed()
    store = KioskStore(tmp_path / "printer.sqlite3")
    store.init()
    monkeypatch.setattr(printer, "STORE", store)
    monkeypatch.setitem(printer.STATE, "proto", type("Proto", (), {"ids": ["char_01"]})())
    monkeypatch.setattr(printer, "read_card_uid", lambda _: "04AABBCC")
    token = "test-only-bridge-token-" * 3
    monkeypatch.setenv("KIOSK_BRIDGE_TOKEN", token)
    monkeypatch.setenv("KIOSK_MIRRORTING_URL", "http://127.0.0.1:8001")
    monkeypatch.setattr(settings, "idprinter_base_url", "http://127.0.0.1:8002")
    monkeypatch.setattr(settings, "idprinter_bridge_token", SecretStr(token))
    monkeypatch.setattr(nfc_bridge, "recent_tap_matches", lambda *_a, **_k: True)
    mirror = TestClient(app)
    kiosk = TestClient(printer.app, client=("127.0.0.1", 50000))
    outage = [True]
    def transport(target, request):
        response = target.request(request.method, request.url.path, headers=dict(request.headers), content=request.content)
        return httpx.Response(response.status_code, content=response.content, headers=response.headers)
    def to_kiosk(request):
        return httpx.Response(503) if outage[0] and request.method == "POST" else transport(kiosk, request)
    with httpx.Client(transport=httpx.MockTransport(to_kiosk)) as upstream, httpx.Client(transport=httpx.MockTransport(lambda r: transport(mirror, r))) as downstream:
        factory = lambda url, key: IDPrinterBridge(url, key, client=upstream)
        monkeypatch.setattr(nfc, "IDPrinterBridge", factory)
        monkeypatch.setattr(sessions, "IDPrinterBridge", factory)
        monkeypatch.setattr(printer, "fetch_mirrorting_report", lambda kid, mid, key, *, base_url: fetch_mirrorting_report(kid, mid, key, base_url=base_url, client=downstream))
        def register(operation):
            response = kiosk.post("/api/nfc/register", json={"operationId": operation, "name": "테스트방문자", "teamId": "ai", "aiMode": "A", "result": {"kind": "A", "characterId": "char_01"}})
            assert response.status_code == 200, response.text
            return response.json()["sessionId"]
        kid = register("integration-visitor-a")
        assert mirror.post("/api/nfc/resolve", json={"uid": "04AABBCC"}).json()["kiosk_session_id"] == kid
        created = mirror.post("/api/sessions", json={"mode": 5, "service_mode": "workplace", "job_role": "office_admin", "scenario_slug": "workplace-conversation", "nfc_uid": "04AABBCC", "kiosk_session_id": kid, "consent": {"agreed": True, "storage_policy": "none"}})
        assert created.status_code == 200, created.text
        session = created.json()
        assert session["kiosk_link_status"] == "pending"
        sid = session["id"]
        headers = {"X-Session-Token": session["access_token"]}
        assert mirror.post(f"/api/sessions/{sid}/kiosk-link").status_code == 403
        outage[0] = False
        for _ in range(2):
            assert mirror.post(f"/api/sessions/{sid}/kiosk-link", headers=headers).json()["status"] == "linked"
        pending = kiosk.get(f"/api/reports/{kid}")
        assert pending.status_code == 409 and pending.json()["error"]["code"] == "REPORT_PENDING"
        turn = session["current_turn"]
        for _ in range(30):
            response = mirror.post(f"/api/sessions/{sid}/turns/{turn['id']}/response", headers=headers, json={"text": "확인했습니다. 오후까지 검토하고 공유하겠습니다.", "duration_ms": 6000, "stt_source": "text"})
            assert response.status_code == 200, response.text
            answer = response.json()
            if answer["finished"]:
                break
            turn = answer["next_turn"]
        assert answer["finished"]
        assert mirror.post(f"/api/sessions/{sid}/finish", headers=headers).status_code == 202
        report = kiosk.get(f"/api/reports/{kid}")
        assert report.status_code == 200, report.text
        payload = report.json()
        assert payload["reportId"] == str(sid) and payload["source"] == "mirrorting"
        assert payload["totalScore"] is None
        assert session["access_token"] not in report.text and token not in report.text
        calls = []
        monkeypatch.setattr(printer, "render_report", lambda *_a, **_k: Image.new("1", (576, 100)))
        monkeypatch.setattr(printer, "print_badge", lambda _: calls.append(True) or {"backend": "screen"})
        body = {"operationId": "integration-report-preview", "sessionId": kid, "reportId": str(sid)}
        preview = kiosk.post("/api/reports/print", json=body)
        assert preview.status_code == 200 and preview.json()["status"] == "preview"
        assert kiosk.post("/api/reports/print", json={**body, "operationId": "integration-repeat-preview"}).json()["printJobId"] == body["operationId"]
        assert len(calls) == 1
        assert register("integration-visitor-b") != kid
        assert mirror.post(f"/api/sessions/{sid}/kiosk-link", headers=headers).json()["status"] == "conflict"
        old = kiosk.get(f"/api/reports/{kid}")
        assert old.status_code == 409 and old.json()["error"]["code"] == "SESSION_REPLACED"
