"""Versioned voice measurements stored independently from non-null legacy score rows."""
import copy
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
import threading

from app.ai import paralinguistics, voice_measurement as engine
from app.ai.stt import get_stt_provider

_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voice-turn")
_SLOT = threading.BoundedSemaphore(1)
LIVE_BUDGET_SEC = 2.0
SCORE_VERSION = "interaction-score-v8"


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
    # 보정은 상대 크기에만 필요하다. 속도·멈춤·참고값의 독립 측정은 유지한다.
    # Reject corrupt/oversized decoded audio before STT can spend time on it.
    try:
        engine.load_audio(path)
    except Exception:
        return engine.analyze(path, session_id=session_id, turn_id=turn_id, references=False), None, None
    words = None
    stt_log = None
    try:
        provider = get_stt_provider()
        if provider:
            started = time.perf_counter()
            try:
                words = provider.transcribe_words(path)
                stt_log = {
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                    "status_code": 200,
                    "error_message": "",
                }
            except Exception as exc:
                stt_log = {
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                    "status_code": 500,
                    "error_message": str(exc)[:1000],
                }
    except Exception as exc:
        stt_log = {"latency_ms": 0, "status_code": 500, "error_message": str(exc)[:1000]}
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
    return measurement, habits, stt_log


def finish_turn(session, turn, *, include_stt_log=False):
    baseline, source = _input(session, turn)
    stt_log = None
    if not turn.audio_path:
        measurement, habits = engine.empty_result(session.id, turn.id), None
    else:
        try:
            # 9/11 계획: 제품 분석은 크기·속도·멈춤만 계산한다.
            result = _measure(turn.audio_path, session.id, turn.id, baseline, source, False)
            if len(result) == 2:  # 기존 테스트/확장 구현의 (measurement, habits) 계약 유지
                measurement, habits = result
            else:
                measurement, habits, stt_log = result
        except Exception:
            # One failed recording must not prevent the remaining turns/report.
            measurement, habits = engine.empty_result(session.id, turn.id, "analysis_failed"), None
    store_measurement(session, turn.id, measurement)
    response_habits = dict(session.rapport.get("response_habits", {}))
    response_habits.pop(str(turn.id), None)
    if habits is not None:
        response_habits[str(turn.id)] = habits
    session.rapport = {**session.rapport, "response_habits": response_habits}
    return (measurement, stt_log) if include_stt_log else measurement


def live_turn(session, turn):
    """No queue build-up; a timed-out worker never writes ORM/session state."""
    if not turn.audio_path or not _SLOT.acquire(blocking=False):
        return engine.empty_result(session.id, turn.id, "analysis_pending")
    baseline, source = _input(session, turn)
    future = _POOL.submit(_measure, turn.audio_path, session.id, turn.id,
                          copy.deepcopy(baseline), copy.deepcopy(source), False)
    future.add_done_callback(lambda _: _SLOT.release())
    try:
        result = future.result(timeout=LIVE_BUDGET_SEC)
        result = result[0] if isinstance(result, tuple) else result
        return result
    except TimeoutError:
        return engine.empty_result(session.id, turn.id, "analysis_timeout")
    except Exception:
        return engine.empty_result(session.id, turn.id, "analysis_failed")


def report_data(session):
    value = session.rapport or {}
    context_scored = any('voice' in row.get('measured', []) and row.get('context_policy', {}).get('status') == 'classified'
                         for row in value.get('judgments', {}).values())
    return {"engine_version": engine.VERSION, "criteria_version": engine.CRITERIA_VERSION,
            "score_status": "context_provisional" if context_scored else "criteria_pending",
            "score_scope": "relative_volume" if context_scored else None,
            "measurement_fields": list(engine.CORE_FIELDS),
            "reference_only": [],
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
