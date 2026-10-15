"""S-B2B-NFC: ACR1252 슬롯 배정과 카드 재태그 회귀."""
import pytest

from app.services import nfc_bridge


def test_sam_slots_never_take_the_mirror_contactless_role():
    assert nfc_bridge.contactless_readers([
        "ACS ACR1252 1S CL Reader SAM 0", "ACS ACR1252 1S CL Reader PICC 0",
        "ACS ACR122U PICC Interface 0", "ACS ACR1252 Reader sam 1",
    ]) == ["ACS ACR1252 1S CL Reader PICC 0", "ACS ACR122U PICC Interface 0"]


def test_card_held_removed_and_immediately_retapped_fires_twice_and_disconnects(monkeypatch):
    import sys
    from types import ModuleType

    # pyscard는 장비 선택 의존성이다. CI에는 설치하지 않아도 이 회귀를 검증한다.
    class NoCardException(Exception):
        pass

    class CardConnectionException(Exception):
        pass

    exceptions = ModuleType("smartcard.Exceptions")
    exceptions.NoCardException = NoCardException
    exceptions.CardConnectionException = CardConnectionException
    system = ModuleType("smartcard.System")
    monkeypatch.setitem(sys.modules, "smartcard", ModuleType("smartcard"))
    monkeypatch.setitem(sys.modules, "smartcard.Exceptions", exceptions)
    monkeypatch.setitem(sys.modules, "smartcard.System", system)

    readings = iter([True, True, False, True])
    disconnected, taps = [], []

    class Connection:
        def connect(self):
            if not next(readings):
                raise NoCardException("no card", 0x8010000C)

        def transmit(self, apdu):
            assert apdu == [0xFF, 0xCA, 0, 0, 0]
            return [4, 0xAA, 0xBB, 0xCC], 0x90, 0

        def disconnect(self):
            disconnected.append(True)

    class Reader:
        def __str__(self):
            return "ACS ACR1252 1S CL Reader PICC 0"

        def createConnection(self):
            return Connection()

    class EndPolling(Exception):
        pass

    cycles = []

    def sleep(_seconds):
        cycles.append(True)
        if len(cycles) == 4:
            raise EndPolling()

    system.readers = lambda: [Reader()]
    monkeypatch.setattr(nfc_bridge.time, "time", lambda: 100.0)
    monkeypatch.setattr(nfc_bridge.time, "sleep", sleep)
    monkeypatch.setattr(nfc_bridge, "record_tap", lambda uid, role: taps.append((uid, role)))
    monkeypatch.setattr(nfc_bridge, "_status", {})
    with pytest.raises(EndPolling):
        nfc_bridge._poll_loop(["mirror"])
    assert taps == [("04AABBCC", "mirror"), ("04AABBCC", "mirror")]
    assert len(disconnected) == 4


def test_operator_status_is_guarded_and_does_not_include_secrets(monkeypatch):
    from fastapi.testclient import TestClient
    from pydantic import SecretStr
    from app.core.config import settings
    from app.main import app

    token = "test-only-bridge-secret-123456789012345"
    monkeypatch.setattr(settings, "admin_token", "")
    monkeypatch.setattr(settings, "admin_auth_required", False)
    monkeypatch.setattr(settings, "idprinter_base_url", "http://192.168.0.20:8002")
    monkeypatch.setattr(settings, "idprinter_bridge_token", SecretStr(token))
    local = TestClient(app, client=("127.0.0.1", 50000))
    response = local.get("/api/nfc/status")
    assert response.status_code == 200
    assert response.json()["idprinter"] == {"configured": True, "valid": True, "mode": "external"}
    assert token not in response.text and "192.168.0.20" not in response.text
    remote = TestClient(app, client=("192.168.0.30", 50000))
    assert remote.get("/api/nfc/status").status_code == 403


def test_bad_bridge_url_is_reported_without_an_internal_error(monkeypatch):
    from fastapi.testclient import TestClient
    from pydantic import SecretStr
    from app.core.config import settings
    from app.main import app

    monkeypatch.setattr(settings, "idprinter_base_url", "http://127.0.0.1:bad")
    monkeypatch.setattr(settings, "idprinter_bridge_token", SecretStr("x" * 32))
    response = TestClient(app).post("/api/nfc/resolve", json={"uid": "04AABBCC"})
    assert response.status_code == 503
    assert "다시 태그" in response.json()["detail"]
