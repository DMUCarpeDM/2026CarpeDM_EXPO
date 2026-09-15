"""Whisper는 간투어 분석 전용이며 실시간 전사 API는 제공하지 않는다."""
from app.main import app


def test_live_stt_route_is_removed():
    assert "/api/sessions/{session_id}/stt" not in app.openapi()["paths"]
