"""녹음 파일 디코딩/전처리 — m4a 등 비-WAV 포함.

soundfile은 libsndfile이 m4a(AAC)를 못 열어서 녹음본 분석이 통째로 막힌다.
PyAV는 ffmpeg 라이브러리를 휠에 포함하므로 시스템 ffmpeg 설치 없이 디코딩된다.
PyAV가 없으면 soundfile로 폴백한다(wav/flac 등은 그대로 처리 가능).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Qwen3-TTS의 extract_speaker_embedding은 24kHz만 받는다.
TARGET_SAMPLE_RATE = 24000


@dataclass(frozen=True)
class DecodedAudio:
    samples: np.ndarray  # mono float32, -1..1
    sample_rate: int
    source_sample_rate: int
    source_channels: int

    @property
    def duration(self) -> float:
        if self.sample_rate <= 0:
            return 0.0
        return len(self.samples) / float(self.sample_rate)


def _decode_with_pyav(path: Path, target_sr: int) -> DecodedAudio:
    import av  # type: ignore

    with av.open(str(path)) as container:
        if not container.streams.audio:
            raise RuntimeError(f"오디오 스트림이 없습니다: {path.name}")
        stream = container.streams.audio[0]
        source_sr = int(stream.rate or 0)
        source_ch = int(getattr(stream, "channels", 0) or 0)

        resampler = av.AudioResampler(format="fltp", layout="mono", rate=target_sr)
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                chunks.append(resampled.to_ndarray().reshape(-1))
        # 리샘플러 내부 버퍼를 비운다. 빠뜨리면 끝부분이 잘린다.
        for resampled in resampler.resample(None):
            chunks.append(resampled.to_ndarray().reshape(-1))

    if not chunks:
        raise RuntimeError(f"디코딩 결과가 비었습니다: {path.name}")
    samples = np.concatenate(chunks).astype(np.float32, copy=False)
    return DecodedAudio(
        samples=samples,
        sample_rate=target_sr,
        source_sample_rate=source_sr,
        source_channels=source_ch,
    )


def _decode_with_soundfile(path: Path, target_sr: int) -> DecodedAudio:
    import soundfile as sf  # type: ignore

    data, source_sr = sf.read(str(path), always_2d=True, dtype="float32")
    source_ch = int(data.shape[1])
    mono = data.mean(axis=1).astype(np.float32, copy=False)
    if int(source_sr) != target_sr:
        mono = _resample_linear(mono, int(source_sr), target_sr)
    return DecodedAudio(
        samples=mono,
        sample_rate=target_sr,
        source_sample_rate=int(source_sr),
        source_channels=source_ch,
    )


def _resample_linear(samples: np.ndarray, source_sr: int, target_sr: int) -> np.ndarray:
    """선형보간 리샘플. 품질 지표 계산과 폴백 경로에만 쓴다."""
    if source_sr <= 0 or target_sr <= 0 or source_sr == target_sr or samples.size == 0:
        return samples
    duration = samples.size / float(source_sr)
    target_n = max(1, int(round(duration * target_sr)))
    src_idx = np.linspace(0.0, samples.size - 1, num=target_n, dtype=np.float64)
    return np.interp(src_idx, np.arange(samples.size), samples).astype(np.float32)


def decode_audio(path: Path, *, target_sr: int = TARGET_SAMPLE_RATE) -> DecodedAudio:
    """어떤 포맷이든 24kHz mono float32로. 원본 파일은 건드리지 않는다."""
    try:
        return _decode_with_pyav(path, target_sr)
    except ImportError:
        return _decode_with_soundfile(path, target_sr)
    except Exception:
        # PyAV가 특정 파일만 못 여는 경우가 있어 soundfile로 한 번 더 시도한다.
        return _decode_with_soundfile(path, target_sr)


def trim_silence(
    samples: np.ndarray,
    *,
    sample_rate: int,
    threshold_db: float = -45.0,
    pad_ms: float = 60.0,
) -> np.ndarray:
    """앞뒤 무음 제거. 화자 임베딩에 무음이 섞이면 음색이 흐려진다."""
    if samples.size == 0:
        return samples
    frame = max(1, int(sample_rate * 0.02))
    n_frames = samples.size // frame
    if n_frames < 2:
        return samples

    trimmed = samples[: n_frames * frame].reshape(n_frames, frame)
    rms = np.sqrt(np.mean(np.square(trimmed), axis=1) + 1e-12)
    peak = float(rms.max())
    if peak <= 0.0:
        return samples
    threshold = peak * (10.0 ** (threshold_db / 20.0))
    voiced = np.nonzero(rms >= threshold)[0]
    if voiced.size == 0:
        return samples

    pad = int(sample_rate * pad_ms / 1000.0)
    start = max(0, voiced[0] * frame - pad)
    end = min(samples.size, (voiced[-1] + 1) * frame + pad)
    return samples[start:end]


def normalize_peak(samples: np.ndarray, *, target_peak: float = 0.95) -> np.ndarray:
    """피크 정규화. 녹음마다 마이크 게인이 달라 임베딩 평균이 흔들리는 걸 막는다."""
    if samples.size == 0:
        return samples
    peak = float(np.abs(samples).max())
    if peak <= 1e-6:
        return samples
    return (samples * (target_peak / peak)).astype(np.float32, copy=False)


def prepare_for_embedding(
    path: Path,
    *,
    target_sr: int = TARGET_SAMPLE_RATE,
) -> DecodedAudio:
    """디코딩 → 무음 트림 → 피크 정규화."""
    decoded = decode_audio(path, target_sr=target_sr)
    samples = trim_silence(decoded.samples, sample_rate=decoded.sample_rate)
    samples = normalize_peak(samples)
    return DecodedAudio(
        samples=samples,
        sample_rate=decoded.sample_rate,
        source_sample_rate=decoded.source_sample_rate,
        source_channels=decoded.source_channels,
    )


def waveform_metrics(samples: np.ndarray) -> tuple[float, float, float, bool]:
    """(peak, rms, silence_ratio, clipping)."""
    if samples.size == 0:
        return 0.0, 0.0, 1.0, False
    absolute = np.abs(samples)
    peak = float(absolute.max())
    rms = float(np.sqrt(np.mean(np.square(samples))))
    silence_ratio = float(np.mean(absolute < 0.01))
    clipping = bool(np.any(absolute >= 0.99))
    return peak, rms, silence_ratio, clipping


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    """16bit PCM wav로 저장."""
    import wave

    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype("<i2").tobytes()
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm)
