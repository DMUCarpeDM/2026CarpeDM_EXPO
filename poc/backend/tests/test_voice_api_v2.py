import io
import json
import threading
from types import SimpleNamespace

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app
from app.ai import voice_measurement as engine
from app.services import voice_analysis, interaction_scoring
from app.seed.run import seed
from app.core.database import SessionLocal
from app.models import RoleplaySession

CAPTURE = {"capture_id": "mic-stream", "device_id": "mic", "auto_gain_control": False,
           "sample_rate": 16000, "channel_count": 1, "echo_cancellation": True, "noise_suppression": False}


def wav(speech=True):
    values = .1 * np.sin(np.arange(32000) * 2 * np.pi * 180 / 16000) if speech else np.zeros(16000)
    file = io.BytesIO()
    sf.write(file, values, 16000, format="WAV", subtype="PCM_16")
    return file.getvalue()


def start(client):
    seed()
    result = client.post("/api/sessions", json={"mode": 5, "difficulty": "basic", "service_mode": "interview",
        "scenario_slug": "interview-fullstack", "consent": {"agreed": True, "storage_policy": "none"}})
    assert result.status_code == 200, result.text
    data = result.json()
    return data, {"X-Session-Token": data["access_token"]}


def calibration(client, data, headers):
    return client.post(f"/api/sessions/{data['id']}/voice/calibration", headers=headers,
        data={"capture": json.dumps(CAPTURE)},
        files={"noise": ("noise.wav", wav(False), "audio/wav"), "speech": ("speech.wav", wav(), "audio/wav")})


def test_calibration_upload_report_and_no_score_or_reference_criticism(monkeypatch, ready_ollama):
    monkeypatch.setattr(engine, "speech_segments", lambda samples, sr, *_: [(0., len(samples)/sr)] if np.any(samples) else [])
    monkeypatch.setattr(voice_analysis, "get_stt_provider", lambda: SimpleNamespace(transcribe_words=lambda _: [
        {"word": "어 안녕하세요", "start": 0., "end": 2., "conf": .95}]))
    monkeypatch.setattr(engine, "reference_metrics", lambda *_: (
        engine.measured(reference_only=True, median_hz=180, p10_hz=170, p90_hz=190, track=[]),
        engine.measured(reference_only=True, segments=[{"start": 0., "end": 2., "jitter_local_pct": 99., "shimmer_local_pct": 99.}])))
    client = TestClient(app)
    data, headers = start(client)
    assert data["voice_analysis"]["engine_version"] == engine.VERSION
    assert calibration(client, data, {}).status_code in {401, 403}
    result = calibration(client, data, headers)
    assert result.status_code == 200, result.text
    cal = result.json()
    assert cal["status"] == "measured"
    tid = data["current_turn"]["id"]
    source = {"calibration_id": cal["id"], "capture": CAPTURE, "excluded_intervals": []}
    upload = client.post(f"/api/sessions/{data['id']}/turns/{tid}/audio", headers=headers,
        data={"voice_input": json.dumps(source)}, files={"file": ("answer.wav", wav(), "audio/wav")})
    assert upload.status_code == 200, upload.text
    response = client.post(f"/api/sessions/{data['id']}/turns/{tid}/response", headers=headers,
        json={"text": "어 안녕하세요", "stt_source": "webspeech", "duration_ms": 2000})
    assert response.status_code == 200, response.text
    judgment = response.json()["turn_signals"]["judgment"]
    assert not [event for event in judgment["events"] if event["area"] == "voice"]
    assert judgment["voice_measurement"]["volume"]["status"] == "measured"
    with SessionLocal() as db:
        session = db.get(RoleplaySession, data["id"])
        turn = next(t for t in session.turns if t.id == tid)
        first = voice_analysis.finish_turn(session, turn)
        second = voice_analysis.finish_turn(session, turn)
        assert first == second
        assert len(session.rapport["voice_measurements"]) == 1
        assert session.rapport["response_habits"][str(tid)]["source"] == "whisper-filler-prompt"
    client.post(f"/api/sessions/{data['id']}/finish", headers=headers)
    report = client.get(f"/api/sessions/{data['id']}/report", headers=headers)
    assert report.status_code == 200, report.text
    report = report.json()
    assert report["fit_scores"]["voice"]["score"] is None
    results = report["speech_stats"]["voice_analysis"]["turns"]
    assert results[0]["volume"]["status"] == "measured"
    assert results[0]["voice_irregularity"]["reference_only"]
    with SessionLocal() as db:
        session = db.get(RoleplaySession, data["id"])
        assert "transcript" not in session.rapport["voice_measurements"][str(tid)]["speed"]
    assert client.delete(f"/api/sessions/{data['id']}/voice/calibration", headers=headers).status_code == 409


def test_bounded_live_analysis_does_not_block_or_write_late(monkeypatch):
    release, started = threading.Event(), threading.Event()
    def slow(*_):
        started.set()
        release.wait(timeout=3)
        return engine.empty_result(1, 2), None
    monkeypatch.setattr(voice_analysis, "_measure", slow)
    monkeypatch.setattr(voice_analysis, "LIVE_BUDGET_SEC", .02)
    session = SimpleNamespace(id=1, rapport={})
    turn = SimpleNamespace(id=2, audio_path="unused.wav")
    try:
        result = voice_analysis.live_turn(session, turn)
        assert started.is_set()
        assert result["quality_flags"] == ["analysis_timeout"]
        assert voice_analysis.live_turn(session, turn)["quality_flags"] == ["analysis_pending"]
    finally:
        release.set()
    assert session.rapport == {}


def test_v2_measurements_cannot_enter_legacy_scoring():
    metrics = {"engine_version": engine.VERSION, "duration_sec": 20, "speech_rate_sps": 20, "long_pause_count": 10}
    assert interaction_scoring.audio_events(1, metrics, "interview") == []


def test_failed_recording_does_not_stop_other_turns_or_reuse_stale_habits(monkeypatch):
    session = SimpleNamespace(id=1, rapport={"response_habits": {"2": {"filler_count": 5}}})
    def measure(path, session_id, turn_id, *_):
        if path == "bad.wav":
            raise RuntimeError("measurement failed")
        return engine.empty_result(session_id, turn_id), {"filler_count": 1}
    monkeypatch.setattr(voice_analysis, "_measure", measure)
    failed = voice_analysis.finish_turn(session, SimpleNamespace(id=2, audio_path="bad.wav"))
    assert failed["quality_flags"] == ["analysis_failed"]
    assert failed["speed"]["syllables_per_second"] is None
    assert "2" not in session.rapport["response_habits"]
    voice_analysis.finish_turn(session, SimpleNamespace(id=3, audio_path="good.wav"))
    assert set(session.rapport["voice_measurements"]) == {"2", "3"}
    assert session.rapport["response_habits"]["3"]["filler_count"] == 1


def test_expired_voice_transcripts_are_purged_even_without_scored_evidence():
    from datetime import timedelta
    from app.main import _purge_expired_quotes
    from app.models import Report, utcnow
    from app.core.config import settings
    client = TestClient(app)
    data, _ = start(client)
    with SessionLocal() as db:
        session = db.get(RoleplaySession, data["id"])
        session.ended_at = utcnow() - timedelta(days=settings.media_retention_days + 1)
        report = Report(session_id=session.id, evidence_segments=[], speech_stats={"voice_analysis": {
            "turns": [{"speed": {"transcript": "private words", "syllables_per_second": 4},
                       "pauses": {"segments": [{"before": "private", "after": "words", "duration_sec": 1}]}}],
            "response_habits": {"1": {"transcript": "private words", "filler_count": 1}}}})
        db.add(report)
        db.commit()
    _purge_expired_quotes()
    with SessionLocal() as db:
        stats = db.get(RoleplaySession, data["id"]).report.speech_stats["voice_analysis"]
        assert "transcript" not in stats["turns"][0]["speed"]
        assert stats["turns"][0]["speed"]["syllables_per_second"] == 4
        assert "before" not in stats["turns"][0]["pauses"]["segments"][0]
        assert stats["response_habits"]["1"] == {"filler_count": 1}
