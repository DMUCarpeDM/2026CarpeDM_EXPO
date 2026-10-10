"""Qwen 스트림 / custom voice / GPT-SoVITS → PCM16 청크."""

from __future__ import annotations

import base64
import json
import logging
import threading
import urllib.error
import urllib.parse
import urllib.request
import wave
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Iterator

from services.voice_runtime.config import CONFIG
from services.voice_runtime.tts_service import TTS_LANGUAGE, TTSService, _pcm16_bytes

DEFAULT_SAMPLE_RATE = 24000
PCM_YIELD_BYTES = 4096
ENGINES = ("qwen", "qwen_custom", "gpt_sovits")
DEFAULT_TTS_MODEL = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"

LOGGER = logging.getLogger(__name__)
_FAST_INFERENCE_LOCK = threading.RLock()
_FAST_WARMUP_LOCK = threading.RLock()
_FAST_WARMUPS: set[tuple[int, str]] = set()


@dataclass(frozen=True)
class StreamSynthRequest:
    text: str
    engine: str = "qwen"
    voice_prompt_hash: str = ""
    tts_model_name: str = DEFAULT_TTS_MODEL
    tone: str | None = None
    custom_speaker: str = "iris"
    custom_model_path: str = ""
    gpt_sovits_url: str = "http://127.0.0.1:9880"
    voice_data_dir: str = ""
    tone_routing: bool = True


def faster_qwen_available() -> bool:
    try:
        import faster_qwen3_tts  # noqa: F401
    except Exception:
        return False
    return True


def normalize_engine(engine: str) -> str:
    value = (engine or "qwen").strip().lower()
    return value if value in ENGINES else "qwen"


def custom_speaker_name(base: str, tone: str | None, *, tone_routing: bool) -> str:
    root = (base or "iris").strip() or "iris"
    if tone_routing and (tone or "").strip():
        return f"{root}_{tone.strip()}"
    return root


def iter_pcm_slices(pcm: bytes, chunk_bytes: int = PCM_YIELD_BYTES) -> Iterator[bytes]:
    step = max(2, int(chunk_bytes or PCM_YIELD_BYTES))
    data = pcm or b""
    for i in range(0, len(data), step):
        piece = data[i : i + step]
        if piece:
            yield piece


def sovits_tts_payload(text: str, ref_audio: str, ref_text: str) -> dict[str, Any]:
    return {
        "text": text,
        "text_lang": "ko",
        "ref_audio_path": ref_audio,
        "prompt_text": ref_text or "",
        "prompt_lang": "ko",
        "media_type": "wav",
        "streaming_mode": False,
    }


def resolve_tone_ref_file(source_file: str, voice_data_dir: str) -> str:
    raw = (source_file or "").strip()
    if not raw:
        return ""
    direct = Path(raw)
    if direct.is_file():
        return str(direct)
    root = Path(voice_data_dir) if (voice_data_dir or "").strip() else None
    if root is None:
        return ""
    for cand in (root / raw, root / direct.name):
        if cand.is_file():
            return str(cand)
    return ""


def _fast_model_key(model_name: str) -> str:
    return f"fast:{model_name}"


def _fast_warmup_key(service: TTSService, model_name: str) -> tuple[int, str]:
    return id(service), model_name


def _fast_model_warmed(model: Any | None) -> bool:
    return bool(model and (getattr(model, "_iris_fast_warmed", False) or getattr(model, "_warmed_up", False)))


def _load_fast_model(service: TTSService, model_name: str) -> Any | None:
    """CUDA graph 모델을 한 번만 로드하고, 실패를 절대 묵살하지 않는다."""
    key = _fast_model_key(model_name)
    cached = service._mm.get_tts(key)
    if cached is not None:
        return cached
    try:
        import faster_qwen3_tts as fast_mod  # type: ignore
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("SLOW FALLBACK ACTIVE: faster-qwen3-tts unavailable (%s)", exc)
        return None

    cls = getattr(fast_mod, "FasterQwen3TTS", None)
    if cls is None:
        LOGGER.error("FAST STREAM ERROR: FasterQwen3TTS class is unavailable")
        return None

    def _load() -> Any:
        try:
            import torch
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("torch is required for Faster Qwen") from exc
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable; Faster Qwen needs CUDA graphs")
        LOGGER.info(
            "FAST QWEN AVAILABLE: version=%s model=%s",
            getattr(fast_mod, "__version__", "unknown"),
            model_name,
        )
        model = cls.from_pretrained(model_name, device="cuda:0", dtype=torch.bfloat16)
        LOGGER.info("FAST QWEN LOADED: model=%s", model_name)
        return model

    try:
        return service._mm.get_or_load_tts(key, _load)
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("FAST STREAM ERROR: model load failed (%s): %s", model_name, exc)
        return None


def fast_backend_diagnostics(
    service: TTSService, model_name: str = DEFAULT_TTS_MODEL
) -> dict[str, bool | str]:
    """health/warmup 응답용으로 실제 fast backend 상태를 노출한다."""
    model = service._mm.get_tts(_fast_model_key(model_name))
    available = faster_qwen_available()
    has_stream = callable(getattr(model, "generate_voice_clone_streaming", None))
    with _FAST_WARMUP_LOCK:
        warming = _fast_warmup_key(service, model_name) in _FAST_WARMUPS
    return {
        "faster_qwen": available,
        "fast_model_loaded": model is not None,
        "fast_model_warmed": _fast_model_warmed(model),
        "fast_model_warming": warming,
        "stream_backend": "faster_qwen3_tts" if has_stream else "qwen_tts_fallback",
    }


def _warm_fast_model(model: Any, model_name: str) -> None:
    with _FAST_INFERENCE_LOCK:
        if _fast_model_warmed(model):
            return
        warmup = getattr(model, "warmup", None)
        if not callable(warmup):
            raise RuntimeError("FasterQwen3TTS warmup() is unavailable")
        LOGGER.info("FAST QWEN WARMUP START: model=%s", model_name)
        try:
            # faster-qwen3-tts 0.3.2의 기본 prefill_len=100을 그대로 사용한다.
            warmup()
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("FAST STREAM ERROR: warmup failed (%s): %s", model_name, exc)
            raise
        setattr(model, "_iris_fast_warmed", True)
        LOGGER.info("FAST QWEN WARMED: model=%s", model_name)


def warmup_faster_qwen(service: TTSService, model_name: str = DEFAULT_TTS_MODEL) -> dict[str, bool | str]:
    if CONFIG.mock_mode:
        raise RuntimeError("mock mode does not load Faster Qwen")
    model = _load_fast_model(service, model_name)
    if model is None:
        raise RuntimeError("Faster Qwen is unavailable; see voice runtime logs for the cause")
    _warm_fast_model(model, model_name)
    return fast_backend_diagnostics(service, model_name)


def schedule_faster_qwen_warmup(service: TTSService, model_name: str = DEFAULT_TTS_MODEL) -> bool:
    """API 요청을 즉시 반환하기 위한 daemon warmup. 중복 요청은 합친다."""
    if CONFIG.mock_mode or not faster_qwen_available():
        return False
    key = _fast_warmup_key(service, model_name)
    with _FAST_WARMUP_LOCK:
        model = service._mm.get_tts(_fast_model_key(model_name))
        if _fast_model_warmed(model) or key in _FAST_WARMUPS:
            return False
        _FAST_WARMUPS.add(key)

    def _run() -> None:
        try:
            warmup_faster_qwen(service, model_name)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("FAST STREAM ERROR: background warmup failed (%s): %s", model_name, exc)
        finally:
            with _FAST_WARMUP_LOCK:
                _FAST_WARMUPS.discard(key)

    threading.Thread(target=_run, name="iris-fast-tts-warmup", daemon=True).start()
    return True


def _pcm_from_audio(audio: Any, sample_rate: int) -> tuple[bytes, int]:
    return _pcm16_bytes(audio), int(sample_rate or DEFAULT_SAMPLE_RATE)


def _iter_stream_call(fn: Any, **kwargs: Any) -> Iterator[tuple[bytes, int]]:
    result = fn(**kwargs)
    if result is None:
        return
    # (wavs, sample_rate) 통짜 반환 vs 청크 generator
    if (
        isinstance(result, (tuple, list))
        and len(result) == 2
        and isinstance(result[1], (int, float))
        and int(result[1]) > 1000
    ):
        wavs, sr = result
        wav = wavs[0] if isinstance(wavs, (list, tuple)) else wavs
        yield _pcm_from_audio(wav, sr)
        return
    if hasattr(result, "__iter__") and not isinstance(result, (bytes, bytearray, str)):
        for item in result:
            audio = item
            sr = DEFAULT_SAMPLE_RATE
            if isinstance(item, (tuple, list)) and item:
                audio = item[0]
                if len(item) > 1 and isinstance(item[1], (int, float)) and int(item[1]) > 1000:
                    sr = int(item[1])
            yield _pcm_from_audio(audio, sr)


def _iter_fast_voice_clone_stream(fn: Any, **kwargs: Any) -> Iterator[tuple[bytes, int]]:
    """FasterQwen의 실제 generator만 허용한다. 통짜 WAV 반환은 fast stream이 아니다."""
    with _FAST_INFERENCE_LOCK:
        result = fn(**kwargs)
        if isinstance(result, (bytes, bytearray, str, tuple, list)):
            raise RuntimeError("Faster Qwen streaming API returned a non-streaming result")
        try:
            iterator = iter(result)
        except TypeError as exc:
            raise RuntimeError("Faster Qwen streaming API returned a non-iterable result") from exc
        for item in iterator:
            if not isinstance(item, (tuple, list)) or len(item) < 2:
                raise RuntimeError("Faster Qwen streaming chunk must be (audio, sample_rate, timing)")
            audio, sample_rate = item[0], item[1]
            if not isinstance(sample_rate, (int, float)) or int(sample_rate) <= 1000:
                raise RuntimeError("Faster Qwen streaming chunk has an invalid sample rate")
            pcm, sr = _pcm_from_audio(audio, int(sample_rate))
            if pcm:
                yield pcm, sr


def _wav_bytes_to_pcm(blob: bytes) -> tuple[bytes, int]:
    with wave.open(BytesIO(blob), "rb") as wf:
        sr = int(wf.getframerate() or DEFAULT_SAMPLE_RATE)
        channels = wf.getnchannels()
        width = wf.getsampwidth()
        raw = wf.readframes(wf.getnframes())
    if width != 2:
        raise RuntimeError("GPT-SoVITS wav는 16bit PCM이어야 합니다.")
    if channels <= 1:
        return raw, sr
    # 스테오면 왼쪽만. ponytail: 다운믹스 대신 첫 채널.
    frame = channels * 2
    return b"".join(raw[i : i + 2] for i in range(0, len(raw), frame)), sr


def fetch_gpt_sovits_wav(*, base_url: str, text: str, ref_audio: str, ref_text: str) -> bytes:
    root = (base_url or "http://127.0.0.1:9880").rstrip("/")
    payload = json.dumps(sovits_tts_payload(text, ref_audio, ref_text), ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8", "Accept": "*/*"}
    errors: list[str] = []
    for url in (f"{root}/tts", root):
        req = urllib.request.Request(url, data=payload, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120.0) as resp:
                body = resp.read()
        except urllib.error.HTTPError as exc:
            errors.append(f"POST {url} HTTP {exc.code}")
            continue
        except Exception as exc:  # noqa: BLE001
            errors.append(f"POST {url}: {exc}")
            continue
        if body[:4] == b"RIFF":
            return body
        try:
            data = json.loads(body.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            errors.append(f"POST {url}: wav가 아님")
            continue
        path = str((data or {}).get("path") or (data or {}).get("audio_path") or "")
        if path and Path(path).is_file():
            return Path(path).read_bytes()
        errors.append(f"POST {url}: 경로 없음")
    query = urllib.parse.urlencode(
        {
            "text": text,
            "text_lang": "ko",
            "ref_audio_path": ref_audio,
            "prompt_lang": "ko",
            "prompt_text": ref_text or "",
        }
    )
    get_url = f"{root}/?{query}"
    try:
        with urllib.request.urlopen(get_url, timeout=120.0) as resp:
            body = resp.read()
        if body[:4] == b"RIFF":
            return body
    except Exception as exc:  # noqa: BLE001
        errors.append(f"GET {root}: {exc}")
    raise RuntimeError("GPT-SoVITS 호출 실패. " + " | ".join(errors[-3:]))


def _tone_ref(service: TTSService, tone: str, voice_data_dir: str) -> tuple[str, str]:
    profile = service.profile
    if profile is None:
        return "", ""
    ref = profile.tone_reference(tone)
    if ref is None:
        return "", ""
    path = resolve_tone_ref_file(ref.source_file, voice_data_dir)
    return path, ref.ref_text or ""


def iter_pcm_chunks(service: TTSService, req: StreamSynthRequest) -> Iterator[tuple[bytes, int]]:
    text = (req.text or "").strip()
    if not text:
        raise RuntimeError("TTS 텍스트가 비어 있습니다.")
    if CONFIG.mock_mode:
        pcm, sr = _pcm16_bytes([0.0] * (DEFAULT_SAMPLE_RATE // 5)), DEFAULT_SAMPLE_RATE
        yield pcm, sr
        return

    engine = normalize_engine(req.engine)
    resolved_tone = service.resolve_tone(text, req.tone) if req.tone_routing else (req.tone or "neutral")
    if engine == "gpt_sovits":
        ref_audio, ref_text = _tone_ref(service, resolved_tone, req.voice_data_dir)
        if not ref_audio:
            raise RuntimeError(
                "GPT-SoVITS 참조 음성이 없습니다. 녹음 폴더(voice_data_dir)에 프로필 source_file이 있어야 합니다."
            )
        blob = fetch_gpt_sovits_wav(
            base_url=req.gpt_sovits_url,
            text=text,
            ref_audio=ref_audio,
            ref_text=ref_text,
        )
        pcm, sr = _wav_bytes_to_pcm(blob)
        yield pcm, sr
        return

    if engine == "qwen_custom":
        model_name = (req.custom_model_path or req.tts_model_name).strip()
        model = service._ensure_tts_model(model_name)
        speaker = custom_speaker_name(req.custom_speaker, resolved_tone, tone_routing=req.tone_routing)
        kwargs = {"text": text, "speaker": speaker, "language": TTS_LANGUAGE}
        fn = getattr(model, "generate_custom_voice_streaming", None) or getattr(
            model, "generate_custom_voice", None
        )
        if fn is None:
            raise RuntimeError("이 체크포인트는 generate_custom_voice를 지원하지 않습니다.")
        try:
            yield from _iter_stream_call(fn, **kwargs)
            return
        except Exception:
            if speaker == req.custom_speaker:
                raise
            kwargs["speaker"] = req.custom_speaker or "iris"
            yield from _iter_stream_call(fn, **kwargs)
            return

    # qwen clone — 저장된 prompt를 먼저 써야 IRIS profile의 x-vector/ICL 특성이 유지된다.
    use_profile = service._should_use_profile(req.voice_prompt_hash)
    ref_audio, ref_text = ("", "")
    prepared = None
    if use_profile:
        ref_audio, ref_text = _tone_ref(service, resolved_tone, req.voice_data_dir)
        prepared = service.prepare_profile_prompt(resolved_tone)
    else:
        prepared = service._mm.get_prepared_voice(req.voice_prompt_hash)

    fast = _load_fast_model(service, req.tts_model_name)
    fast_reason = ""
    if fast is not None:
        stream_fn = getattr(fast, "generate_voice_clone_streaming", None)
        if not callable(stream_fn):
            fast_reason = "generate_voice_clone_streaming() is unavailable"
            LOGGER.error("FAST STREAM ERROR: %s", fast_reason)
        elif prepared is None and not ref_audio:
            fast_reason = "no prepared voice clone prompt or reference audio"
            LOGGER.error("FAST STREAM ERROR: %s", fast_reason)
        else:
            kwargs: dict[str, Any] = {
                "text": text,
                "language": TTS_LANGUAGE,
                "chunk_size": int(CONFIG.tts_stream_chunk_size),
            }
            if prepared is not None and prepared.voice_clone_prompt is not None:
                kwargs["voice_clone_prompt"] = prepared.voice_clone_prompt
            else:
                kwargs["ref_audio"] = ref_audio
                kwargs["ref_text"] = ref_text
            emitted = False
            try:
                _warm_fast_model(fast, req.tts_model_name)
                LOGGER.info(
                    "FAST STREAM ACTIVE: model=%s chunk_size=%s",
                    req.tts_model_name,
                    kwargs["chunk_size"],
                )
                for pcm, sr in _iter_fast_voice_clone_stream(stream_fn, **kwargs):
                    emitted = True
                    yield pcm, sr
                if emitted:
                    return
                fast_reason = "stream completed without PCM"
                LOGGER.warning("FAST STREAM ERROR: %s", fast_reason)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("FAST STREAM ERROR: %s", exc)
                if emitted:
                    raise RuntimeError(
                        "Faster Qwen stream failed after PCM; stopping to avoid duplicate speech"
                    ) from exc
                fast_reason = str(exc)
    else:
        fast_reason = "Faster Qwen model is unavailable"

    if fast_reason:
        LOGGER.warning("SLOW FALLBACK ACTIVE: %s", fast_reason)

    if prepared is None or prepared.voice_clone_prompt is None:
        raise RuntimeError("voice clone prompt가 없습니다. 기준 음성을 다시 확정하세요.")
    model = service._ensure_tts_model(req.tts_model_name)
    generate_kwargs: dict[str, Any] = {
        "text": text,
        "language": TTS_LANGUAGE,
        "voice_clone_prompt": prepared.voice_clone_prompt,
    }
    if not use_profile:
        from services.voice_runtime.tts_service import TTS_X_VECTOR_ONLY_MODE

        generate_kwargs["x_vector_only_mode"] = TTS_X_VECTOR_ONLY_MODE
    wavs, sample_rate = model.generate_voice_clone(**generate_kwargs)
    pcm, sr = _pcm_from_audio(wavs[0], sample_rate)
    for piece in iter_pcm_slices(pcm):
        yield piece, sr


def iter_pcm_events(service: TTSService, req: StreamSynthRequest) -> Iterator[dict[str, Any]]:
    started = False
    sr = DEFAULT_SAMPLE_RATE
    engine = normalize_engine(req.engine)
    for pcm, rate in iter_pcm_chunks(service, req):
        sr = int(rate or sr)
        if not started:
            yield {"type": "start", "sample_rate": sr, "engine": engine}
            started = True
        yield {"type": "chunk", "pcm_b64": base64.b64encode(pcm).decode("ascii")}
    if not started:
        yield {"type": "start", "sample_rate": sr, "engine": engine}
    yield {"type": "end", "sample_rate": sr, "engine": engine}
