"""The companion client contract against the kiosk's authenticated bridge."""

import httpx
import pytest

from app.services.idprinter_bridge import BridgeError, IDPrinterBridge


def test_snapshot_then_link_keeps_uid_and_kiosk_session_identity():
    calls = []

    def handler(request):
        calls.append(request)
        assert request.headers["X-Bridge-Token"] == "private-server-token"
        if request.method == "GET":
            assert request.url.path == "/api/integrations/mirrorting/cards/04AABBCC"
            return httpx.Response(200, json={"ok": True, "sessionId": "MW2610030001", "cardUid": "04AABBCC"})
        assert request.url.path == "/api/integrations/mirrorting/link"
        assert request.method == "POST"
        assert request.content == b'{"sessionId":"MW2610030001","cardUid":"04AABBCC","mirrorSessionId":42,"accessToken":"mirror-private-token"}'
        return httpx.Response(200, json={"ok": True, "status": "linked", "sessionId": "MW2610030001", "mirrorSessionId": 42})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        bridge = IDPrinterBridge("http://127.0.0.1:8002", "private-server-token", client=client)
        snapshot = bridge.resolve("04:aa:bb:cc")
        result = bridge.link(snapshot, 42, "mirror-private-token")
    assert snapshot.uid == "04AABBCC"
    assert result["status"] == "linked"
    assert len(calls) == 2


def test_reissue_between_snapshot_and_link_is_a_conflict_not_success():
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json={"ok": True, "sessionId": "MW2610030001", "cardUid": "04AABBCC"})
        # Kiosk has since rebound this physical card to another visitor.
        return httpx.Response(409, json={"ok": False, "error": {"code": "OPERATION_CONFLICT"}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        bridge = IDPrinterBridge("http://127.0.0.1:8002", "private-server-token", client=client)
        snapshot = bridge.resolve("04AABBCC")
        with pytest.raises(BridgeError, match="KIOSK_LINK_CONFLICT"):
            bridge.link(snapshot, 42, "mirror-private-token")


def test_resolve_rejects_mismatched_uid_or_missing_token():
    with httpx.Client(transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json={"ok": True, "sessionId": "MW2610030001", "cardUid": "FFFFFFFF"})
    )) as client:
        bridge = IDPrinterBridge("http://127.0.0.1:8002", "private-server-token", client=client)
        with pytest.raises(BridgeError, match="KIOSK_BRIDGE_INVALID_RESPONSE"):
            bridge.resolve("04AABBCC")
    with pytest.raises(BridgeError, match="KIOSK_BRIDGE_UNCONFIGURED"):
        IDPrinterBridge("http://127.0.0.1:8002", "")
    with pytest.raises(BridgeError, match="KIOSK_BRIDGE_UNCONFIGURED"):
        IDPrinterBridge("http://127.0.0.1:bad", "private-server-token")


def test_unknown_or_unauthorized_card_never_produces_a_snapshot():
    for status, expected in ((404, "KIOSK_CARD_NOT_FOUND"), (403, "KIOSK_BRIDGE_UNAUTHORIZED")):
        with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(status))) as client:
            bridge = IDPrinterBridge("http://127.0.0.1:8002", "private-server-token", client=client)
            with pytest.raises(BridgeError, match=expected):
                bridge.resolve("04AABBCC")
