"""9/17 개정안: 원본 시간축의 측정값만 반환한다. 점수·성격·감정 판정은 없다."""
from dataclasses import asdict, dataclass
from functools import lru_cache
import hashlib
import math
import re
import threading

import numpy as np
import soundfile as sf

VERSION = "voice-measure-v2"
CRITERIA_VERSION = "voice-unvalidated-v1"
FIELDS = ("volume", "speed", "pauses", "pitch", "voice_irregularity")
CAPTURE_KEYS = ("capture_id", "device_id", "sample_rate", "channel_count", "auto_gain_control", "noise_suppression", "echo_cancellation")
_VAD_LOCK = threading.Lock()  # Silero ONNX wrapper carries recurrent state.


@dataclass(frozen=True)
class VoiceConfig:
    # 검출·신호 품질 초기 설정. 말하기 합격/감점 경계가 아니다.
    frame_ms: int = 64
    hop_ms: int = 16
    vad_threshold: float = .5
    min_speech_ms: int = 250
    min_silence_ms: int = 100
    speech_pad_ms: int = 30
    min_speech_sec: float = 1.0
    min_noise_sec: float = .5
    min_snr_db: float = 10.0
    clipping_ratio: float = .001
    min_word_probability: float = .5
    min_word_coverage: float = .5
    pitch_min: float = 65.0
    pitch_max: float = 500.0
    min_periodic_sec: float = .25
    max_duration_sec: float = 120.0


DEFAULT = VoiceConfig()


def missing(reason, *, status="unmeasured", **values):
    return {"status": status, "reason": reason, "label": None, **values}


def measured(**values):
    return {"status": "measured", "reason": None, "label": None, **values}


def complete_shape(result):
    defaults = {
        "volume": {"relative_db": None, "rms": None, "reference_rms": None},
        "speed": {"syllables": None, "speech_seconds": None, "syllables_per_second": None, "overall_syllables_per_second": None},
        "pauses": {"count": None, "segments": []},
        "pitch": {"median_hz": None, "p10_hz": None, "p90_hz": None, "track": [], "reference_only": True},
        "voice_irregularity": {"segments": [], "reference_only": True},
    }
    for field, values in defaults.items():
        result[field] = {**values, **result[field]}
    return result


def empty_result(session_id=None, turn_id=None, reason="audio_missing"):
    return complete_shape({"engine_version": VERSION, "criteria_version": CRITERIA_VERSION,
            "session_id": session_id, "turn_id": turn_id, "calibration_id": None,
            "analysis_status": "unmeasured", "quality_flags": [reason],
            **{name: missing(reason) for name in FIELDS}})


def load_audio(path, config=DEFAULT):
    # Bound decoded data before allocating it. WAV/FLAC are read without normalization.
    info = sf.info(path)
    if not 8000 <= info.samplerate <= 192000 or info.channels not in (1, 2):
        raise ValueError("unsupported_audio_format")
    if not 0 < info.duration <= config.max_duration_sec:
        raise ValueError("invalid_audio_duration")
    samples, sr = sf.read(path, dtype="float64", always_2d=True)
    if not np.isfinite(samples).all():
        raise ValueError("nonfinite_audio")
    return samples.mean(axis=1), sr, info.channels


@lru_cache(maxsize=1)
def _vad_model():
    from silero_vad import load_silero_vad
    return load_silero_vad(onnx=True)


def speech_segments(samples, sr, config=DEFAULT):
    from scipy.signal import resample_poly
    from silero_vad import get_speech_timestamps
    divisor = math.gcd(sr, 16000)
    audio = resample_poly(samples, 16000 // divisor, sr // divisor).astype(np.float32)
    with _VAD_LOCK:
        segments = get_speech_timestamps(audio, _vad_model(), sampling_rate=16000,
            threshold=config.vad_threshold, min_speech_duration_ms=config.min_speech_ms,
            min_silence_duration_ms=config.min_silence_ms, speech_pad_ms=config.speech_pad_ms)
    duration = len(samples) / sr
    return [(row["start"] / 16000, min(duration, row["end"] / 16000)) for row in segments]


def _overlaps(start, end, excluded):
    return any(start < right and end > left for left, right in excluded)


def _subtract(segments, excluded):
    remaining = segments
    for left, right in excluded:
        next_segments = []
        for start, end in remaining:
            if start < left:
                next_segments.append((start, min(end, left)))
            if end > right:
                next_segments.append((max(start, right), end))
        remaining = [(a, b) for a, b in next_segments if b > a]
    return remaining


def _rms(samples, sr, segments, config=DEFAULT):
    import librosa
    frame = round(sr * config.frame_ms / 1000)
    hop = round(sr * config.hop_ms / 1000)
    values = []
    for start, end in segments:
        chunk = samples[round(start * sr):round(end * sr)]
        if len(chunk) >= frame:
            values.extend(librosa.feature.rms(y=chunk, frame_length=frame, hop_length=hop, center=False)[0])
    return float(np.median(values)) if values else None


def capture_matches(baseline, current):
    return bool(baseline and current and baseline.get("capture_id") and baseline.get("device_id")
                and all(baseline.get(k) == current.get(k) for k in CAPTURE_KEYS))


def calibrate(noise_path, speech_path, capture, config=DEFAULT):
    """환경음과 본인의 기준 발화. 통과는 녹음 품질 확인이며 적절한 성량 인증이 아니다."""
    import uuid
    result = {"id": str(uuid.uuid4()), "status": "unmeasured", "reason": None,
              "engine_version": VERSION, "criteria_version": CRITERIA_VERSION,
              "capture": capture, "config": asdict(config), "reference_rms": None}
    try:
        noise, noise_sr, _ = load_audio(noise_path, config)
        speech, sr, _ = load_audio(speech_path, config)
        segments = speech_segments(speech, sr, config)
        rms = _rms(speech, sr, segments, config)
        noise_rms = float(np.sqrt(np.mean(noise ** 2)))
        snr = 20 * math.log10(rms / max(noise_rms, 1e-9)) if rms and rms > 0 else None
        result.update(reference_rms=rms, noise_rms=noise_rms, snr_db=snr,
                      speech_seconds=sum(b - a for a, b in segments))
        if not capture.get("capture_id") or not capture.get("device_id"):
            reason = "capture_unknown"
        elif capture.get("auto_gain_control") is not False:
            reason = "automatic_gain_unverified"
        elif noise_sr != sr or len(noise) / noise_sr < config.min_noise_sec:
            reason = "noise_sample_invalid"
        elif np.mean(np.abs(speech) >= .999) > config.clipping_ratio or np.mean(np.abs(noise) >= .999) > config.clipping_ratio:
            reason = "clipping"
        elif not rms or rms <= 1e-6 or result["speech_seconds"] < config.min_speech_sec:
            reason = "insufficient_speech"
        elif speech_segments(noise, noise_sr, config):
            reason = "speech_in_noise_sample"
        elif snr is None or snr < config.min_snr_db:
            reason = "background_noise"
        else:
            reason = None
        result.update(status="measured" if reason is None else "uncertain", reason=reason)
    except Exception as exc:
        result.update(status="unmeasured", reason=str(exc) if isinstance(exc, ValueError) else "calibration_failed")
    return result


def _speed(words, segments, duration, config):
    seconds = sum(b - a for a, b in segments)
    span = segments[-1][1] - segments[0][0]
    if words is None:
        return missing("transcription_unavailable")
    text = " ".join(str(word.get("word", "")) for word in words)
    # Preserve fillers/repetitions; don't invent pronunciations for digits or Latin/Hanja.
    if re.search(r"[^가-힣\s.,!?…·~\-—'\"“”‘’():;]", text):
        return missing("pronunciation_ambiguous", status="uncertain", transcript=text,
                       normalization="hangul-verbatim-v1")
    if not words or not re.search(r"[가-힣]", text):
        return missing("transcript_empty")
    covered = []
    for word in words:
        start, end, probability = word.get("start"), word.get("end"), word.get("conf")
        if not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in (start, end, probability)):
            return missing("word_timing_or_quality_missing", status="uncertain")
        if probability < config.min_word_probability or not 0 <= start < end <= duration + .05:
            return missing("transcript_quality", status="uncertain")
        intersections = [(max(a, start), min(b, end)) for a, b in segments if min(b, end) > max(a, start)]
        if not intersections:
            return missing("transcript_outside_speech", status="uncertain")
        covered.extend(intersections)
    union = []
    for a, b in sorted(covered):
        if union and a <= union[-1][1]:
            union[-1] = (union[-1][0], max(b, union[-1][1]))
        else:
            union.append((a, b))
    if seconds < config.min_speech_sec or sum(b - a for a, b in union) / seconds < config.min_word_coverage:
        return missing("insufficient_transcript_coverage", status="uncertain")
    count = len(re.findall(r"[가-힣]", text))
    return measured(syllables=count, speech_seconds=round(seconds, 4), span_seconds=round(span, 4),
                    syllables_per_second=round(count / seconds, 4), overall_syllables_per_second=round(count / span, 4),
                    transcript=text, normalization="hangul-verbatim-v1", source="whisper-verbatim")


def _pitch(samples, sr, segments, config):
    import librosa
    track = []
    for start, end in segments:
        frame = 2048 if sr <= 24000 else 4096
        chunk = samples[round(start * sr):round(end * sr)]
        if len(chunk) < frame or end - start < config.min_periodic_sec:
            continue
        hop = max(1, round(sr * .04))
        f0, voiced, _ = librosa.pyin(chunk, sr=sr, fmin=config.pitch_min, fmax=config.pitch_max,
                                   frame_length=frame, hop_length=hop, center=False, fill_na=np.nan)
        for index, value in enumerate(f0):
            if voiced[index] and np.isfinite(value):
                track.append({"time": round(start + (index * hop + frame / 2) / sr, 4), "hz": round(float(value), 3)})
    if not track:
        return missing("periodic_speech_insufficient", reference_only=True)
    hz = np.array([row["hz"] for row in track])
    median = float(np.median(hz))
    return measured(reference_only=True, method="librosa-pyin", median_hz=median,
        p10_hz=float(np.percentile(hz, 10)), p90_hz=float(np.percentile(hz, 90)),
        track=[{**row, "relative_semitones": round(12 * math.log2(row["hz"] / median), 3)} for row in track])


def _irregularity(samples, sr, segments, config):
    import parselmouth
    from parselmouth.praat import call
    values = []
    for start, end in segments:
        if end - start < config.min_periodic_sec:
            continue
        chunk = samples[round(start * sr):round(end * sr)]
        sound = parselmouth.Sound(chunk, sampling_frequency=sr)
        point = call(sound, "To PointProcess (periodic, cc)", config.pitch_min, config.pitch_max)
        periods = call(point, "Get number of periods", 0, 0, 1 / config.pitch_max, 1 / config.pitch_min, 1.3)
        mean_period = call(point, "Get mean period", 0, 0, 1 / config.pitch_max, 1 / config.pitch_min, 1.3)
        periodic_seconds = periods * mean_period
        if periods < 10 or not math.isfinite(periodic_seconds) or periodic_seconds < config.min_periodic_sec or periodic_seconds / (end - start) < .5:
            continue
        jitter = call(point, "Get jitter (local)", 0, 0, 1 / config.pitch_max, 1 / config.pitch_min, 1.3)
        shimmer = call([sound, point], "Get shimmer (local)", 0, 0, 1 / config.pitch_max, 1 / config.pitch_min, 1.3, 1.6)
        if np.isfinite(jitter) and np.isfinite(shimmer):
            values.append({"start": start, "end": end, "period_count": int(periods), "periodic_seconds": periodic_seconds,
                           "jitter_local_pct": float(jitter * 100), "shimmer_local_pct": float(shimmer * 100)})
    return measured(reference_only=True, method="praat-period-local", segments=values) if values else missing("periodic_speech_insufficient", reference_only=True)


def reference_metrics(samples, sr, segments, config=DEFAULT):
    results = []
    # A missing Praat/pYIN measurement never destroys the other valid result.
    for fn, reason in ((_pitch, "pitch_failed"), (_irregularity, "praat_failed")):
        try:
            results.append(fn(samples, sr, segments, config))
        except Exception:
            results.append(missing(reason, reference_only=True))
    return tuple(results)


def _analyze(path, *, session_id=None, turn_id=None, calibration=None, capture=None,
            words=None, excluded=(), config=DEFAULT, references=True):
    result = empty_result(session_id, turn_id)
    result.update(calibration_id=(calibration or {}).get("id"), config=asdict(config), quality_flags=[])
    try:
        samples, sr, channels = load_audio(path, config)
    except Exception as exc:
        result["quality_flags"] = [str(exc) if isinstance(exc, ValueError) else "audio_decode_failed"]
        result.update({name: missing(result["quality_flags"][0]) for name in FIELDS})
        result["analysis_status"] = "error"
        return result
    duration = len(samples) / sr
    result.update(duration_sec=duration, sample_rate=sr, channels=channels,
                  excluded_intervals=[list(row) for row in excluded])
    try:
        segments = _subtract(speech_segments(samples, sr, config), excluded)
    except Exception:
        result.update({name: missing("vad_unavailable") for name in FIELDS}, quality_flags=["vad_unavailable"])
        return result
    result["speech_segments"] = [{"start": a, "end": b} for a, b in segments]
    if not segments:
        result.update({name: missing("no_speech") for name in FIELDS}, quality_flags=["no_speech"])
        return result
    clipped = float(np.mean(np.abs(samples) >= .999)) > config.clipping_ratio
    if clipped:
        result["quality_flags"].append("clipping")
    try:
        rms = _rms(samples, sr, segments, config)
        if not calibration or calibration.get("status") != "measured":
            result["volume"] = missing("calibration_required")
        elif not capture_matches(calibration.get("capture"), capture):
            result["volume"] = missing("capture_changed", status="uncertain")
        elif calibration.get("config") != asdict(config):
            result["volume"] = missing("calibration_config_changed", status="uncertain")
        elif clipped:
            result["volume"] = missing("clipping", status="uncertain")
        elif not rms or rms <= 0 or not calibration.get("reference_rms") or calibration["reference_rms"] <= 1e-6:
            result["volume"] = missing("reference_invalid")
        else:
            result["volume"] = measured(relative_db=20 * math.log10(rms / calibration["reference_rms"]), rms=rms,
                                        reference_rms=calibration["reference_rms"], segments=result["speech_segments"])
    except Exception:
        result["volume"] = missing("rms_failed")
    usable_words = None if words is None else [w for w in words if not (
        isinstance(w.get("start"), (int, float)) and isinstance(w.get("end"), (int, float))
        and _overlaps(w["start"], w["end"], excluded))]
    result["speed"] = _speed(usable_words, segments, duration, config)
    pauses = []
    for (_, end), (start, _) in zip(segments, segments[1:]):
        if start <= end or _overlaps(end, start, excluded):
            continue
        key = f"{session_id}:{turn_id}:{VERSION}:pause:{end:.4f}:{start:.4f}"
        before = [w["word"] for w in usable_words or [] if isinstance(w.get("end"), (float, int)) and w["end"] <= end + .1]
        after = [w["word"] for w in usable_words or [] if isinstance(w.get("start"), (float, int)) and w["start"] >= start - .1]
        pauses.append({"id": hashlib.sha256(key.encode()).hexdigest()[:24], "start": end, "end": start,
                       "duration_sec": start - end, "before": " ".join(before[-8:]), "after": " ".join(after[:8]), "label": None})
    result["pauses"] = measured(count=len(pauses), segments=pauses)
    if references and not clipped:
        try:
            result["pitch"], result["voice_irregularity"] = reference_metrics(samples, sr, segments, config)
        except Exception:
            result["pitch"] = missing("reference_analysis_failed", reference_only=True)
            result["voice_irregularity"] = missing("reference_analysis_failed", reference_only=True)
    else:
        reason = "clipping" if clipped else "deferred"
        result["pitch"] = missing(reason, reference_only=True)
        result["voice_irregularity"] = missing(reason, reference_only=True)
    statuses = [result[field]["status"] for field in FIELDS]
    result["analysis_status"] = "completed" if all(s == "measured" for s in statuses) else "partial" if "measured" in statuses else "unmeasured"
    return result


def analyze(path, **kwargs):
    return complete_shape(_analyze(path, **kwargs))
