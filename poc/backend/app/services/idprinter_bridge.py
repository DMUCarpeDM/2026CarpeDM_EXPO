"""Server-side companion client for the IDPrinter kiosk.

The MirrorTing server, never its browser, calls the IDPrinter server over a
trusted operator-configured URL. A card snapshot is resolved before creating a
roleplay session; a link is attempted only for that exact snapshot afterward.
The IDPrinter server must check that the UID still belongs to that kiosk
session when the link arrives, so a late request cannot attach a reused card
to the next visitor.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import quote, urlsplit

import httpx


class BridgeError(Exception):
    def __init__(self, code: str, *, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class CardSnapshot:
    uid: str
    kiosk_session_id: str


def _base_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        parsed.port  # Reject malformed ports before making a network request.
    except ValueError as exc:
        raise BridgeError("KIOSK_BRIDGE_UNCONFIGURED") from exc
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise BridgeError("KIOSK_BRIDGE_UNCONFIGURED")
    return value.rstrip("/")


def _uid(value: str) -> str:
    normalized = value.replace(":", "").replace("-", "").upper()
    if not re.fullmatch(r"[0-9A-F]{4,32}", normalized):
        raise BridgeError("KIOSK_CARD_INVALID")
    return normalized


class IDPrinterBridge:
    def __init__(self, url: str, token: str, *, client: httpx.Client | None = None):
        self.base_url = _base_url(url)
        if not token:
            raise BridgeError("KIOSK_BRIDGE_UNCONFIGURED")
        self._headers = {"X-Bridge-Token": token, "Accept": "application/json"}
        self._client = client or httpx.Client(timeout=5, follow_redirects=False, trust_env=False)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> IDPrinterBridge:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _call(self, method: str, path: str, *, json: dict | None = None) -> dict:
        try:
            response = self._client.request(
                method, self.base_url + path, headers=self._headers,
                json=json, follow_redirects=False,
            )
        except httpx.TimeoutException as exc:
            raise BridgeError("KIOSK_BRIDGE_TIMEOUT", retryable=True) from exc
        except httpx.RequestError as exc:
            raise BridgeError("KIOSK_BRIDGE_UNAVAILABLE", retryable=True) from exc
        if response.status_code in (401, 403):
            raise BridgeError("KIOSK_BRIDGE_UNAUTHORIZED")
        if response.status_code == 404:
            raise BridgeError("KIOSK_CARD_NOT_FOUND")
        if response.status_code == 409:
            raise BridgeError("KIOSK_LINK_CONFLICT")
        if response.status_code >= 500:
            raise BridgeError("KIOSK_BRIDGE_UNAVAILABLE", retryable=True)
        if response.status_code != 200:
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE")
        try:
            body = response.json()
        except ValueError as exc:
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE") from exc
        if not isinstance(body, dict) or body.get("ok") is not True:
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE")
        return body

    def resolve(self, card_uid: str) -> CardSnapshot:
        """Snapshot the currently active IDPrinter visit before roleplay create."""
        uid = _uid(card_uid)
        body = self._call("GET", f"/api/integrations/mirrorting/cards/{quote(uid)}")
        session_id = body.get("sessionId")
        echoed_uid = body.get("cardUid")
        if not isinstance(session_id, str) or not re.fullmatch(r"MW[0-9]{10}", session_id):
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE")
        if echoed_uid != uid:
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE")
        return CardSnapshot(uid=uid, kiosk_session_id=session_id)

    def link(self, snapshot: CardSnapshot, mirror_session_id: int, access_token: str) -> dict:
        """Link exactly the pre-create snapshot; identical retries are safe.

        IDPrinter must atomically verify the UID is *still* active for this
        kiosk session. A reissue between resolve and link must yield 409/404.
        """
        if isinstance(mirror_session_id, bool) or not isinstance(mirror_session_id, int) or mirror_session_id < 1:
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE")
        if not isinstance(access_token, str) or not access_token:
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE")
        payload = {
            "sessionId": snapshot.kiosk_session_id,
            "cardUid": snapshot.uid,
            "mirrorSessionId": mirror_session_id,
            "accessToken": access_token,
        }
        body = self._call("POST", "/api/integrations/mirrorting/link", json=payload)
        if body.get("sessionId") != snapshot.kiosk_session_id or body.get("mirrorSessionId") != mirror_session_id:
            raise BridgeError("KIOSK_BRIDGE_INVALID_RESPONSE")
        return body
