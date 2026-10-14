import copy
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from pathlib import Path
import pytest
from app.services import voice_analysis as voice

@pytest.fixture
def setup(tmp_path, monkeypatch):
    path = tmp_path / 'answer.wav'
    path.write_bytes(b'first-recording')
    session = SimpleNamespace(id=91, rapport={'voice_inputs': {'1': {'calibration_id': 'cal', 'excluded_intervals': []}}, 'voice_calibrations': {'cal': {'reference_rms': .1}}})
    turn = SimpleNamespace(id=1, audio_path=str(path))
    calls = []
    def measure(*args):
        calls.append(args)
        return ({'analysis_status': 'completed', 'speed': {'syllables_per_second': 3.2}}, {'transcript': '가상 답변', 'filler_count': 1}, {'status_code': 200, 'latency_ms': 123, 'error_message': ''})
    monkeypatch.setattr(voice, '_measure', measure)
    monkeypatch.setattr(voice, '_PENDING', OrderedDict())
    monkeypatch.setattr(voice, '_SLOT', threading.BoundedSemaphore(1))
    with ThreadPoolExecutor(max_workers=1) as pool:
        monkeypatch.setattr(voice, '_POOL', pool)
        yield session, turn, calls, measure


def test_live_result_survives_session_reload_and_skips_stt(setup):
    session, turn, calls, _ = setup
    live = voice.live_turn(session, turn)
    reloaded = SimpleNamespace(id=session.id, rapport=copy.deepcopy(session.rapport))
    final, log = voice.finish_turn(reloaded, turn, include_stt_log=True)
    assert final == live
    assert len(calls) == 1
    assert log is None
    assert reloaded.rapport['response_habits']['1']['filler_count'] == 1


@pytest.mark.parametrize('change', ['audio', 'calibration', 'exclusion', 'capture', 'model', 'prompt'])
def test_changed_inputs_force_reanalysis(setup, monkeypatch, change):
    session, turn, calls, _ = setup
    voice.live_turn(session, turn)
    if change == 'audio':
        Path(turn.audio_path).write_bytes(b'other-recording')
    elif change == 'calibration':
        session.rapport['voice_calibrations']['cal']['reference_rms'] = .2
    elif change == 'exclusion':
        session.rapport['voice_inputs']['1']['excluded_intervals'] = [[0, 1]]
    elif change == 'capture':
        session.rapport['voice_inputs']['1']['capture'] = {'device_id': 'new-mic'}
    else:
        monkeypatch.setattr(voice.settings, 'stt_whisper_model' if change == 'model' else 'stt_filler_prompt', 'changed')
    voice.finish_turn(session, turn)
    assert len(calls) == 2


def test_timed_out_work_is_joined_without_repeating_or_late_orm_write(setup, monkeypatch):
    session, turn, calls, measure = setup
    release = threading.Event()
    def slow(*args):
        release.wait(timeout=2)
        return measure(*args)
    monkeypatch.setattr(voice, '_measure', slow)
    monkeypatch.setattr(voice, 'LIVE_BUDGET_SEC', .01)
    original = copy.deepcopy(session.rapport)
    assert voice.live_turn(session, turn)['quality_flags'] == ['analysis_timeout']
    assert session.rapport == original
    release.set()
    assert voice.finish_turn(session, turn)['speed']['syllables_per_second'] == 3.2
    assert len(calls) == 1
    assert not voice._PENDING


def test_failed_stt_retries_and_only_missing_turn_runs(setup, monkeypatch):
    session, turn, calls, measure = setup
    def failed(*args):
        result = measure(*args)
        return result[0], None, {**result[2], 'status_code': 500}
    monkeypatch.setattr(voice, '_measure', failed)
    voice.live_turn(session, turn)
    monkeypatch.setattr(voice, '_measure', measure)
    voice.finish_turn(session, turn)
    voice.finish_turn(session, turn)
    voice.finish_turn(session, SimpleNamespace(id=2, audio_path=turn.audio_path))
    assert len(calls) == 3
    voice.strip_verbatim(session)
    assert 'voice_cache_keys' not in session.rapport
    assert 'transcript' not in session.rapport['response_habits']['1']
