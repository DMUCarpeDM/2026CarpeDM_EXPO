from __future__ import annotations

import csv
import json
import math
import wave
from dataclasses import asdict, dataclass
from pathlib import Path

SUPPORTED_AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"}


@dataclass
class VoiceSampleAnalysis:
    audio_path: str
    file_name: str
    extension: str
    duration: float
    sample_rate: int
    channels: int
    peak: float
    rms: float
    silence_ratio: float
    clipping: bool
    readable: bool
    transcript: str
    language: str
    language_probability: float
    quality_score: float
    excluded_reason: str
    reviewed: bool = False
    selected: bool = False


def discover_audio_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    out: list[Path] = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_AUDIO_EXTS:
            out.append(path.resolve())
    return sorted(out)


def _metrics_from_samples(
    samples: list[float],
    *,
    sample_rate: int,
    channels: int,
) -> tuple[float, int, int, float, float, float, bool]:
    if not samples or sample_rate <= 0:
        return 0.0, sample_rate, channels, 0.0, 0.0, 1.0, False
    duration = len(samples) / float(sample_rate)
    peak = max(abs(v) for v in samples)
    rms = math.sqrt(sum(v * v for v in samples) / len(samples))
    silence_threshold = 0.01
    silence_ratio = sum(1 for v in samples if abs(v) < silence_threshold) / float(len(samples))
    clipping = any(abs(v) >= 0.99 for v in samples)
    return duration, sample_rate, channels, peak, rms, silence_ratio, clipping


def _analyze_wav_basic(path: Path) -> tuple[float, int, int, float, float, float, bool]:
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sample_rate = wf.getframerate()
        sampwidth = wf.getsampwidth()
        frames = wf.getnframes()
        raw = wf.readframes(frames)

    duration = frames / float(sample_rate or 1)
    if sampwidth != 2 or not raw:
        return duration, sample_rate, channels, 0.0, 0.0, 1.0, False

    import array

    arr = array.array("h")
    arr.frombytes(raw)
    if not arr:
        return duration, sample_rate, channels, 0.0, 0.0, 1.0, False
    samples = [v / 32768.0 for v in arr]
    return _metrics_from_samples(samples, sample_rate=sample_rate, channels=channels)


def _analyze_with_soundfile(path: Path) -> tuple[float, int, int, float, float, float, bool]:
    import numpy as np  # type: ignore
    import soundfile as sf  # type: ignore

    data, sample_rate = sf.read(str(path), always_2d=True)
    channels = int(data.shape[1]) if getattr(data, "ndim", 1) > 1 else 1
    flat = np.asarray(data, dtype=float).reshape(-1)
    # 스테레오면 채널 평균으로 품질 지표만 계산 (원본 파일은 수정하지 않음)
    if channels > 1:
        flat = np.asarray(data, dtype=float).mean(axis=1)
    samples = [float(v) for v in flat.tolist()]
    return _metrics_from_samples(samples, sample_rate=int(sample_rate), channels=channels)


def _analyze_with_decoder(path: Path) -> tuple[float, int, int, float, float, float, bool]:
    """PyAV 디코더로 지표를 낸다. m4a처럼 libsndfile이 못 여는 포맷도 처리된다."""
    from .audio_io import decode_audio, waveform_metrics

    decoded = decode_audio(path)
    peak, rms, silence_ratio, clipping = waveform_metrics(decoded.samples)
    return (
        decoded.duration,
        decoded.source_sample_rate or decoded.sample_rate,
        decoded.source_channels or 1,
        peak,
        rms,
        silence_ratio,
        clipping,
    )


def quality_score(
    *,
    duration: float,
    silence_ratio: float,
    clipping: bool,
    language_probability: float,
    readable: bool,
) -> float:
    if not readable:
        return 0.0
    score = 100.0
    if duration < 5.0:
        score -= (5.0 - duration) * 6.0
    elif duration > 15.0:
        score -= min(25.0, (duration - 15.0) * 2.0)
    score -= min(30.0, silence_ratio * 45.0)
    if clipping:
        score -= 25.0
    score -= max(0.0, (1.0 - language_probability) * 20.0)
    return max(0.0, min(100.0, round(score, 2)))


def _probe_duration_meta(path: Path) -> tuple[float, int, int]:
    """디코더 없이 길이/샘플레이트/채널 추정 (가능 시). 원본 수정 없음."""
    try:
        from mutagen import File as MutagenFile  # type: ignore

        meta = MutagenFile(str(path))
        if meta is None:
            return 0.0, 0, 0
        duration = float(getattr(meta.info, "length", 0.0) or 0.0)
        sample_rate = int(getattr(meta.info, "sample_rate", 0) or 0)
        channels = int(getattr(meta.info, "channels", 0) or 0)
        return duration, sample_rate, channels
    except Exception:
        return 0.0, 0, 0


def analyze_voice_file(
    path: Path,
    *,
    transcript: str = "",
    language: str = "ko",
    language_probability: float = 0.0,
) -> VoiceSampleAnalysis:
    ext = path.suffix.lower()
    readable = True
    excluded_reason = ""
    duration = 0.0
    sample_rate = 0
    channels = 0
    peak = 0.0
    rms = 0.0
    silence_ratio = 1.0
    clipping = False

    try:
        if ext == ".wav":
            try:
                duration, sample_rate, channels, peak, rms, silence_ratio, clipping = _analyze_wav_basic(path)
            except Exception:
                duration, sample_rate, channels, peak, rms, silence_ratio, clipping = _analyze_with_soundfile(path)
        else:
            try:
                duration, sample_rate, channels, peak, rms, silence_ratio, clipping = _analyze_with_decoder(path)
            except Exception:
                try:
                    duration, sample_rate, channels, peak, rms, silence_ratio, clipping = _analyze_with_soundfile(path)
                except Exception as exc:  # noqa: BLE001
                    # ponytail: m4a 등은 mutagen 길이만이라도. 원본 미수정.
                    duration, sample_rate, channels = _probe_duration_meta(path)
                    if duration > 0:
                        excluded_reason = f"waveform metrics unavailable: {exc}"
                        silence_ratio = 0.2
                        peak = 0.5
                        rms = 0.1
                    else:
                        excluded_reason = f"decoder unavailable: {exc}"
    except Exception as exc:  # noqa: BLE001
        readable = False
        excluded_reason = str(exc)

    score = quality_score(
        duration=duration,
        silence_ratio=silence_ratio,
        clipping=clipping,
        language_probability=language_probability,
        readable=readable,
    )
    return VoiceSampleAnalysis(
        audio_path=str(path),
        file_name=path.name,
        extension=ext,
        duration=round(duration, 4),
        sample_rate=sample_rate,
        channels=channels,
        peak=round(peak, 6),
        rms=round(rms, 6),
        silence_ratio=round(silence_ratio, 6),
        clipping=clipping,
        readable=readable,
        transcript=transcript,
        language=language,
        language_probability=round(language_probability, 6),
        quality_score=score,
        excluded_reason=excluded_reason,
    )


def recommend_reference_samples(
    samples: list[VoiceSampleAnalysis],
    *,
    top_k: int = 5,
) -> list[VoiceSampleAnalysis]:
    filtered = [
        s
        for s in samples
        if s.readable and not s.clipping and s.duration > 0.5
    ]
    if not filtered:
        filtered = [s for s in samples if s.readable and s.duration > 0.5]
    if not filtered:
        filtered = [s for s in samples if s.readable]
    ko = [s for s in filtered if (s.language or "").lower().startswith("ko") or not s.language]
    pool = ko or filtered
    return sorted(
        pool,
        key=lambda s: (
            abs(s.duration - 9.0) if s.duration > 0 else 999.0,
            -s.language_probability,
            -s.quality_score,
            s.silence_ratio,
        ),
    )[:top_k]


def write_manifest(samples: list[VoiceSampleAnalysis], *, jsonl_path: Path, csv_path: Path) -> None:
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [asdict(s) for s in samples]
    with jsonl_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        if not rows:
            f.write("")
            return
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def load_manifest(jsonl_path: Path) -> list[VoiceSampleAnalysis]:
    if not jsonl_path.is_file():
        return []
    out: list[VoiceSampleAnalysis] = []
    fields = VoiceSampleAnalysis.__dataclass_fields__
    for line in jsonl_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        kwargs = {}
        for name, field in fields.items():
            if name not in data:
                continue
            kwargs[name] = data[name]
        try:
            out.append(VoiceSampleAnalysis(**kwargs))
        except TypeError:
            continue
    return out


def analyze_folder(
    root: Path,
    *,
    jsonl_path: Path,
    csv_path: Path,
    transcribe_fn=None,
) -> tuple[list[VoiceSampleAnalysis], list[VoiceSampleAnalysis]]:
    """폴더 분석 → manifest 저장 → 추천 top5 반환. 원본 파일은 수정하지 않음."""
    files = discover_audio_files(root)
    samples: list[VoiceSampleAnalysis] = []
    for path in files:
        transcript = ""
        language = "ko"
        language_probability = 0.0
        if transcribe_fn is not None:
            try:
                tr = transcribe_fn(path)
                transcript = str(tr.get("text") or "")
                language = str(tr.get("language") or "ko")
                language_probability = float(tr.get("language_probability") or 0.0)
            except Exception as exc:  # noqa: BLE001
                transcript = ""
                language = "ko"
                language_probability = 0.0
                # 전사는 참고용 — 실패해도 메타 분석은 유지
                _ = exc
        samples.append(
            analyze_voice_file(
                path,
                transcript=transcript,
                language=language,
                language_probability=language_probability,
            )
        )
    write_manifest(samples, jsonl_path=jsonl_path, csv_path=csv_path)
    return samples, recommend_reference_samples(samples, top_k=5)
