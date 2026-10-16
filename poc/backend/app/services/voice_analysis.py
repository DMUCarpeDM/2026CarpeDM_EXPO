"""Versioned voice measurements stored independently from non-null legacy score rows."""
import copy
import hashlib
import json
import math
from pathlib import Path
from collections import OrderedDict
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
import threading

from app.ai import paralinguistics, voice_measurement as engine
from app.ai.stt import get_stt_provider
from app.core.config import settings

_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voice-turn")
_SLOT = threading.BoundedSemaphore(1)
LIVE_BUDGET_SEC = 2.0
SCORE_VERSION = "interaction-score-v11"
# Retain timed-out work without letting worker threads mutate SQLAlchemy objects.
_PENDING = OrderedDict()
_PENDING_LOCK = threading.Lock()
_PENDING_TTL = 1800
_PENDING_LIMIT = 128


def _fingerprint(turn, baseline, source):
    try:
        with Path(turn.audio_path).open("rb") as audio:
            digest = hashlib.file_digest(audio, "sha256").hexdigest()
    except (OSError, TypeError):
        return None
    config = [digest, baseline, source, engine.VERSION, engine.CRITERIA_VERSION, "session-volume-v1",
              settings.stt_whisper_model, settings.stt_filler_prompt]
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()


def _pending(key, future=None):
    with _PENDING_LOCK:
        now = time.monotonic()
        for old_key, (at, _) in list(_PENDING.items()):
            if now - at > _PENDING_TTL:
                del _PENDING[old_key]
        if future is not None:
            _PENDING[key] = (now, future)
            while len(_PENDING) > _PENDING_LIMIT:
                _PENDING.popitem(last=False)
        return _PENDING.get(key, (None, None))[1]


def _forget(key):
    with _PENDING_LOCK:
        _PENDING.pop(key, None)


def _cached(session, turn, fingerprint):
    value = session.rapport or {}
    if fingerprint and value.get("voice_cache_keys", {}).get(str(turn.id)) == fingerprint:
        return value.get("voice_measurements", {}).get(str(turn.id))
    return None


def _save_result(session, turn, result, fingerprint):
    measurement, habits = result[:2]
    log = result[2] if len(result) > 2 else None
    store_measurement(session, turn.id, measurement)
    value = session.rapport or {}
    response_habits = dict(value.get("response_habits", {}))
    response_habits.pop(str(turn.id), None)
    if habits is not None:
        response_habits[str(turn.id)] = habits
    keys = dict(value.get("voice_cache_keys", {}))
    keys.pop(str(turn.id), None)
    # Retry unavailable/failed STT later; never turn an incomplete result into a cache hit.
    if fingerprint and log and log["status_code"] == 200 and measurement.get("analysis_status") != "error":
        keys[str(turn.id)] = fingerprint
    session.rapport = {**value, "response_habits": response_habits, "voice_cache_keys": keys}
    return measurement, log



def enabled(session):
    return (session.rapport or {}).get("voice_engine_version") == engine.VERSION


def standard_session_state():
    # 공통 분석 설정이며 개인 기준 발화를 측정한 것으로 취급하지 않는다.
    baseline = {"id": "standard-v1", "status": "standard", "can_proceed": True,
                "source": "standard", "reference_rms": None,
                "engine_version": engine.VERSION, "criteria_version": engine.CRITERIA_VERSION}
    return {"voice_engine_version": engine.VERSION, "voice_calibration_id": baseline["id"],
            "voice_calibrations": {baseline["id"]: baseline}}


def public_state(session):
    if not enabled(session):
        return {}
    value = session.rapport or {}
    baseline = value.get("voice_calibrations", {}).get(value.get("voice_calibration_id"))
    return {"engine_version": engine.VERSION, "calibration": baseline,
            "calibration_required": not bool(baseline and baseline.get("source") == "standard"), "criteria_version": engine.CRITERIA_VERSION}


def _input(session, turn):
    value = session.rapport or {}
    source = (getattr(turn, "nonverbal_metrics", None) or {}).get("_voice_input")
    if source is None:
        source = value.get("voice_inputs", {}).get(str(turn.id), {})
    baseline = value.get("voice_calibrations", {}).get(source.get("calibration_id"))
    return baseline, source


def store_measurement(session, turn_id, measurement):
    values = {**(session.rapport or {}).get("voice_measurements", {}), str(turn_id): measurement}
    session.rapport = {**(session.rapport or {}), "voice_measurements": values}


def scoring_measurements(session):
    """표준 설정에서는 같은 장치의 앞선 유효 발화를 비교 기준으로 쓴다. 개인 표준으로 가장하지 않는다."""
    from app.services.judgments import number
    values = copy.deepcopy((session.rapport or {}).get("voice_measurements", {}))
    references = []
    for turn in sorted(session.turns, key=lambda t: t.order):
        voice = values.get(str(turn.id), {})
        volume, capture = voice.get("volume") or {}, voice.get("capture") or {}
        if (voice.get("engine_version") != engine.VERSION or voice.get("turn_id") != turn.id
                or volume.get("reason") != "personal_reference_unavailable"
                or set(voice.get("quality_flags", [])).intersection({"clipping", "no_speech", "analysis_failed", "vad_unavailable"})
                or capture.get("auto_gain_control") is not False
                or not all(number(volume.get(k)) for k in ("rms", "speech_seconds", "noise_seconds", "snr_db"))
                or volume["rms"] <= 1e-6 or volume["speech_seconds"] < 3
                or volume["noise_seconds"] < .5 or volume["snr_db"] < 10):
            continue
        reference = next((r for r in references if engine.capture_matches(r["capture"], capture)), None)
        if reference:
            voice["volume"] = engine.measured(**{k: v for k, v in volume.items() if k not in {"status", "reason", "label", "reference_only"}})
            voice["volume"].update(relative_db=20 * math.log10(volume["rms"] / reference["rms"]),
                reference_rms=reference["rms"], reference_source="session", reference_turn_id=reference["turn_id"])
            voice["calibration_id"] = f"session-turn-{reference['turn_id']}"
        else:
            references.append({"turn_id": turn.id, "rms": volume["rms"], "capture": capture})
    return values


def _measure(path, session_id, turn_id, baseline, source, references):
    # 보정은 상대 크기에만 필요하다. 속도·멈춤·참고값의 독립 측정은 유지한다.
    # Reject corrupt/oversized decoded audio before STT can spend time on it.
    try:
        decoded_audio = engine.load_audio(path)
        samples, rate, _ = decoded_audio
    except Exception:
        return engine.analyze(path, session_id=session_id, turn_id=turn_id, references=False), None, None
    excluded = source.get("excluded_intervals", ())
    try:
        detected_segments = engine.speech_segments(samples, rate)
    except Exception:
        return engine.analyze(path, session_id=session_id, turn_id=turn_id,
            calibration=baseline, capture=source.get("capture"), excluded=excluded,
            decoded_audio=decoded_audio, references=False), None, None
    segments = engine._subtract(detected_segments, excluded)
    if not segments:
        result = engine.analyze(path, session_id=session_id, turn_id=turn_id,
            calibration=baseline, capture=source.get("capture"), excluded=excluded, references=False,
            decoded_audio=decoded_audio, detected_segments=detected_segments)
        return result, None, {"status_code": 200, "latency_ms": 0, "error_message": "", "skipped": "no_user_speech"}
    # Preserve small pauses and filler sounds, but exclude AI audio and long silence.
    regions = []
    for start, end in segments:
        if (regions and start - regions[-1][1] <= 1.0
                and not engine._overlaps(regions[-1][1], start, excluded)):
            regions[-1][1] = end
        else:
            regions.append([start, end])
    words = None
    stt_log = None
    try:
        provider = get_stt_provider()
        if provider:
            started = time.perf_counter()
            try:
                words = provider.transcribe_regions(path, regions) if hasattr(provider, "transcribe_regions") else provider.transcribe_words(path)
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
        excluded=excluded, references=references,
        decoded_audio=decoded_audio, detected_segments=detected_segments)
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
    fingerprint = _fingerprint(turn, baseline, source)
    cached = _cached(session, turn, fingerprint)
    if cached is not None:
        return (cached, None) if include_stt_log else cached
    key = (session.id, turn.id, fingerprint)
    future = _pending(key) if fingerprint else None
    try:
        if not turn.audio_path:
            result = engine.empty_result(session.id, turn.id), None, None
        else:
            result = future.result() if future else _measure(
                turn.audio_path, session.id, turn.id, baseline, source, False)
            if future and (len(result) < 3 or not result[2] or result[2]["status_code"] != 200):
                result = _measure(turn.audio_path, session.id, turn.id, baseline, source, False)
    except Exception:
        result = engine.empty_result(session.id, turn.id, "analysis_failed"), None, None
    finally:
        _forget(key)
    if fingerprint != _fingerprint(turn, baseline, source):
        fingerprint = None
    measurement, stt_log = _save_result(session, turn, result, fingerprint)
    return (measurement, stt_log) if include_stt_log else measurement


def live_turn(session, turn, *, wait=True):
    """Bound the live wait; retain completed and in-flight work for the report."""
    baseline, source = _input(session, turn)
    fingerprint = _fingerprint(turn, baseline, source)
    cached = _cached(session, turn, fingerprint)
    if cached is not None:
        return cached
    key = (session.id, turn.id, fingerprint)
    future = _pending(key) if fingerprint else None
    if future and not future.done():
        return engine.empty_result(session.id, turn.id, "analysis_pending")
    if future is None:
        if not turn.audio_path or not _SLOT.acquire(blocking=False):
            return engine.empty_result(session.id, turn.id, "analysis_pending")
        future = _POOL.submit(_measure, turn.audio_path, session.id, turn.id,
                              copy.deepcopy(baseline), copy.deepcopy(source), False)
        if fingerprint:
            _pending(key, future)
        future.add_done_callback(lambda _: _SLOT.release())
    if not wait:
        return engine.empty_result(session.id, turn.id, "analysis_pending")
    try:
        result = future.result(timeout=LIVE_BUDGET_SEC)
        if fingerprint != _fingerprint(turn, baseline, source):
            fingerprint = None
        measurement, _ = _save_result(session, turn, result, fingerprint)
        _forget(key)
        return measurement
    except TimeoutError:
        return engine.empty_result(session.id, turn.id, "analysis_timeout")
    except Exception:
        _forget(key)
        return engine.empty_result(session.id, turn.id, "analysis_failed")


def report_data(session):
    value = session.rapport or {}
    context_scored = any('voice' in row.get('measured', []) and row.get('context_policy', {}).get('status') == 'classified'
                         for row in value.get('judgments', {}).values())
    return {"engine_version": engine.VERSION, "criteria_version": engine.CRITERIA_VERSION,
            "score_status": "context_provisional" if context_scored else "measurement_provisional" if any(
                'voice' in row.get('measured', []) for row in value.get('judgments', {}).values()) else "criteria_pending",
            "score_scope": "pace_pauses_and_relative_volume" if context_scored else None,
            "measurement_fields": list(engine.CORE_FIELDS),
            "reference_only": [],
            "turns": list(scoring_measurements(session).values()),
            "response_habits": value.get("response_habits", {})}


def strip_verbatim(session):
    with _PENDING_LOCK:
        for key in list(_PENDING):
            if key[0] == session.id:
                del _PENDING[key]
    value = copy.deepcopy(session.rapport or {})
    value.pop("voice_cache_keys", None)
    for result in value.get("voice_measurements", {}).values():
        result.get("speed", {}).pop("transcript", None)
        for pause in result.get("pauses", {}).get("segments", []):
            pause.pop("before", None)
            pause.pop("after", None)
    for habits in value.get("response_habits", {}).values():
        habits.pop("transcript", None)
    session.rapport = value


def prime_stored_turn(session_id, turn_id):
    # Workers retain pure measurement futures; they never write session JSON while dialogue runs.
    from app.core.database import SessionLocal
    from app.models import RoleplaySession, Turn
    with SessionLocal() as db:
        session, turn = db.get(RoleplaySession, session_id), db.get(Turn, turn_id)
        if session and turn and turn.session_id == session.id and turn.audio_path:
            live_turn(session, turn, wait=False)
