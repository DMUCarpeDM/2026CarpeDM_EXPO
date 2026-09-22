from dataclasses import asdict
import json

import numpy as np
import pytest
import soundfile as sf

from app.ai import voice_measurement as voice

CAPTURE = {"capture_id": "recording-1", "device_id": "mic-1", "auto_gain_control": False,
           "sample_rate": 16000, "channel_count": 1, "echo_cancellation": True, "noise_suppression": False}


def tone(seconds=2, amplitude=.1, sr=16000):
    return amplitude * np.sin(np.arange(int(sr * seconds)) * 2 * np.pi * 180 / sr)


def write(tmp_path, data, name="speech.wav", sr=16000):
    path = tmp_path / name
    sf.write(path, data, sr, subtype="FLOAT")
    return str(path)


def baseline(rms):
    return {"id": "cal-1", "status": "measured", "reference_rms": rms, "capture": CAPTURE,
            "config": asdict(voice.DEFAULT)}


def test_half_amplitude_is_minus_six_db_without_scoring(tmp_path, monkeypatch):
    segments = [(0., 2.)]
    monkeypatch.setattr(voice, "speech_segments", lambda *_: segments)
    rms = voice._rms(tone(), 16000, segments)
    result = voice.analyze(write(tmp_path, tone(amplitude=.05)), calibration=baseline(rms), capture=CAPTURE, references=False)
    assert result["volume"]["relative_db"] == pytest.approx(-6.0206, abs=.001)
    assert result["volume"]["label"] is None
    assert "score" not in result and "penalty" not in result
    json.dumps(result, allow_nan=False)


def test_missing_whisper_does_not_remove_valid_volume_or_pauses(tmp_path, monkeypatch):
    monkeypatch.setattr(voice, "speech_segments", lambda *_: [(0., 2.)])
    result = voice.analyze(write(tmp_path, tone()), calibration=baseline(.07), capture=CAPTURE, words=None, references=False)
    assert result["volume"]["status"] == result["pauses"]["status"] == "measured"
    assert result["speed"]["reason"] == "transcription_unavailable"
    assert result["analysis_status"] == "partial"


@pytest.mark.parametrize("update", [{"capture_id": "new"}, {"device_id": "new"}, {"auto_gain_control": True}, {"sample_rate": 48000}])
def test_input_change_invalidates_volume(tmp_path, monkeypatch, update):
    monkeypatch.setattr(voice, "speech_segments", lambda *_: [(0., 2.)])
    result = voice.analyze(write(tmp_path, tone()), calibration=baseline(.07), capture={**CAPTURE, **update}, references=False)
    assert result["volume"]["reason"] == "capture_changed"
    assert result["volume"]["relative_db"] is None


def test_pauses_ignore_edges_and_app_wait_preserve_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(voice, "speech_segments", lambda *_: [(1., 3.), (4., 6.), (8., 9.)])
    path = write(tmp_path, tone(seconds=10))
    args = dict(session_id=1, turn_id=2, excluded=[(6., 8.)], references=False)
    result = voice.analyze(path, **args)
    repeat = voice.analyze(path, **args)
    pauses = result["pauses"]["segments"]
    assert [(p["start"], p["end"]) for p in pauses] == [(3., 4.)]
    assert result["pauses"] == repeat["pauses"]


def test_speed_counts_filler_and_repetition_but_abstains_on_unknown_pronunciation():
    segments = [(1., 3.)]
    word = {"word": "어 저는 저는요", "start": 1., "end": 3., "conf": .9}
    result = voice._speed([word], segments, 4., voice.DEFAULT)
    assert result["syllables"] == 6
    assert result["syllables_per_second"] == 3
    assert voice._speed([{**word, "word": "2026 API"}], segments, 4., voice.DEFAULT)["reason"] == "pronunciation_ambiguous"
    assert voice._speed([{**word, "conf": None}], segments, 4., voice.DEFAULT)["status"] == "uncertain"


def test_all_silence_and_bad_audio_abstain(tmp_path):
    result = voice.analyze(write(tmp_path, np.zeros(16000)))
    assert result["analysis_status"] == "unmeasured"
    assert all(result[field]["status"] == "unmeasured" for field in voice.FIELDS)
    result = voice.analyze(write(tmp_path, np.array([float("nan")] * 16000)))
    assert result["analysis_status"] == "error"


def test_calibration_detects_clipping_and_agc(tmp_path, monkeypatch):
    noise = write(tmp_path, np.zeros(16000), "noise.wav")
    speech = write(tmp_path, tone())
    monkeypatch.setattr(voice, "speech_segments", lambda samples, *_: [(0., len(samples)/16000)] if np.any(samples) else [])
    good = voice.calibrate(noise, speech, CAPTURE)
    assert good["status"] == "measured"
    assert voice.calibrate(noise, speech, {**CAPTURE, "auto_gain_control": None})["reason"] == "automatic_gain_unverified"
    clipped = write(tmp_path, np.ones(32000), "clipped.wav")
    assert voice.calibrate(noise, clipped, CAPTURE)["reason"] == "clipping"


def test_reference_partial_failure_preserves_pitch(monkeypatch):
    monkeypatch.setattr(voice, "_pitch", lambda *_: voice.measured(median_hz=180, reference_only=True))
    monkeypatch.setattr(voice, "_irregularity", lambda *_: (_ for _ in ()).throw(RuntimeError("unavailable")))
    pitch, irregularity = voice.reference_metrics(tone(), 16000, [(0, 2)])
    assert pitch["median_hz"] == 180
    assert irregularity["reason"] == "praat_failed"


def test_real_libraries_measure_periodic_reference_without_inventing_confidence():
    pitch, irregularity = voice.reference_metrics(tone(), 16000, [(0., 2.)])
    assert pitch["median_hz"] == pytest.approx(180, abs=3)
    assert irregularity["segments"][0]["jitter_local_pct"] < .1
    assert pitch["reference_only"] and irregularity["reference_only"]
    assert "confidence" not in pitch
