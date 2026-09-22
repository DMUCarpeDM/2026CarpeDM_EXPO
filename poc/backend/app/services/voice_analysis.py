"""Versioned voice measurements stored independently from non-null legacy score rows."""
import copy
from concurrent.futures import ThreadPoolExecutor, TimeoutError
import threading

from app.ai import paralinguistics, voice_measurement as engine
from app.ai.stt import get_stt_provider

_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voice-turn")
_SLOT = threading.BoundedSemaphore(1)
LIVE_BUDGET_SEC = 2.0
SCORE_VERSION = "interaction-score-v2"


def enabled(session):
    return (session.rapport or {}).get("voice_engine_version") == engine.VERSION


def public_state(session):
    if not enabled(session):
        return {}
    value = session.rapport or {}
    baseline = value.get("voice_calibrations", {}).get(value.get("voice_calibration_id"))
    return {"engine_version": engine.VERSION, "calibration": baseline,
            "calibration_required": True, "criteria_version": engine.CRITERIA_VERSION}


def _input(session, turn):
    value = session.rapport or {}
    source = value.get("voice_inputs", {}).get(str(turn.id), {})
    baseline = value.get("voice_calibrations", {}).get(source.get("calibration_id"))
    return baseline, source


def store_measurement(session, turn_id, measurement):
    values = {**(session.rapport or {}).get("voice_measurements", {}), str(turn_id): measurement}
    session.rapport = {**(session.rapport or {}), "voice_measurements": values}


def _measure(path, session_id, turn_id, baseline, source, references):
    if not baseline or baseline.get("status") != "measured":
        return engine.empty_result(session_id, turn_id, "calibration_required"), None
    if not engine.capture_matches(baseline.get("capture"), source.get("capture")):
        return engine.empty_result(session_id, turn_id, "capture_changed"), None
    # Reject corrupt/oversized decoded audio before STT can spend time on it.
    try:
        engine.load_audio(path)
    except Exception:
        return engine.analyze(path, session_id=session_id, turn_id=turn_id, references=False), None
    words = None
    try:
        provider = get_stt_provider()
        if provider:
            words = provider.transcribe_words(path)
    except Exception:
        pass
    measurement = engine.analyze(path, session_id=session_id, turn_id=turn_id,
        calibration=baseline, capture=source.get("capture"), words=words,
        excluded=source.get("excluded_intervals", ()), references=references)
    habits = None
    if words is not None:
        excluded = source.get("excluded_intervals", ())
        words = [w for w in words if isinstance(w.get("start"), (int, float)) and isinstance(w.get("end"), (int, float))
                 and not engine._overlaps(w["start"], w["end"], excluded)]
        transcript = " ".join(word["word"] for word in words)
        habits = {**paralinguistics.analyze_fillers(transcript), "source": "whisper-filler-prompt",
                  "estimated": True, "status": "measured" if words else "unmeasured", "transcript": transcript}
    return measurement, habits


def finish_turn(session, turn):
    baseline, source = _input(session, turn)
    if not turn.audio_path:
        measurement, habits = engine.empty_result(session.id, turn.id), None
    else:
        try:
            measurement, habits = _measure(turn.audio_path, session.id, turn.id, baseline, source, True)
        except Exception:
            # One failed recording must not prevent the remaining turns/report.
            measurement, habits = engine.empty_result(session.id, turn.id, "analysis_failed"), None
    store_measurement(session, turn.id, measurement)
    response_habits = dict(session.rapport.get("response_habits", {}))
    response_habits.pop(str(turn.id), None)
    if habits is not None:
        response_habits[str(turn.id)] = habits
    session.rapport = {**session.rapport, "response_habits": response_habits}
    return measurement


def live_turn(session, turn):
    """No queue build-up; a timed-out worker never writes ORM/session state."""
    if not turn.audio_path or not _SLOT.acquire(blocking=False):
        return engine.empty_result(session.id, turn.id, "analysis_pending")
    baseline, source = _input(session, turn)
    future = _POOL.submit(_measure, turn.audio_path, session.id, turn.id,
                          copy.deepcopy(baseline), copy.deepcopy(source), False)
    future.add_done_callback(lambda _: _SLOT.release())
    try:
        result, _ = future.result(timeout=LIVE_BUDGET_SEC)
        return result
    except TimeoutError:
        return engine.empty_result(session.id, turn.id, "analysis_timeout")
    except Exception:
        return engine.empty_result(session.id, turn.id, "analysis_failed")


def report_data(session):
    value = session.rapport or {}
    return {"engine_version": engine.VERSION, "criteria_version": engine.CRITERIA_VERSION,
            "score_status": "criteria_pending", "reference_only": ["pitch", "voice_irregularity"],
            "turns": list(value.get("voice_measurements", {}).values()),
            "response_habits": value.get("response_habits", {})}


def strip_verbatim(session):
    value = copy.deepcopy(session.rapport or {})
    for result in value.get("voice_measurements", {}).values():
        result.get("speed", {}).pop("transcript", None)
        for pause in result.get("pauses", {}).get("segments", []):
            pause.pop("before", None)
            pause.pop("after", None)
    for habits in value.get("response_habits", {}).values():
        habits.pop("transcript", None)
    session.rapport = value
