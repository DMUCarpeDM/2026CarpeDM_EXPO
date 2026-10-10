from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import CONFIG
from .model_manager import PreparedVoiceClone, VoiceModelManager
from .tone_router import TONE_NEUTRAL, classify_text_tone
from .voice_profile import VoiceProfile, load_default_profile

# qwen-tts는 language 문자열을 프로세서 프롬프트에 그대로 넣는다.
# "Korean"(대문자)로 주면 발음이 깨지므로 반드시 소문자로 고정한다.
TTS_LANGUAGE = "korean"

# 사용자가 폴더에서 고른 단일 기준 음성 경로의 기본값.
# ICL은 ref_text가 기준 음성과 정확히 일치해야 하는데, 사용자가 손으로 적은
# 대본은 어긋나기 쉬워서 이 경로에서는 화자 임베딩만 쓴다.
TTS_X_VECTOR_ONLY_MODE = True

# 보이스 프로필 경로는 전사문이 녹음과 함께 저장돼 있어 ICL을 신뢰할 수 있다.
PROFILE_PROMPT_PREFIX = "profile"

# qwen-tts는 language 문자열을 프로세서 프롬프트에 그대로 넣는다.
# "Korean"(대문자)로 주면 발음이 깨지므로 반드시 소문자로 고정한다.
TTS_LANGUAGE = "korean"

# x_vector_only_mode=True: 화자 임베딩만 사용 (ref_text 무시).
# ICL 모드(False)는 ref_text가 기준 음성과 정확히 일치해야 해서 불안정하다.
TTS_X_VECTOR_ONLY_MODE = True


def _sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8", errors="ignore")).hexdigest()


def _pcm16_bytes(wav: Any) -> bytes:
    """float 파형(-1..1)을 16bit PCM 리틀엔디안 바이트로 변환. numpy는 있으면 사용."""
    try:
        import numpy as np

        data = np.asarray(wav, dtype="float32").reshape(-1)
        peak = float(np.max(np.abs(data))) if data.size else 0.0
        if peak > 1.0:
            data = data / peak
        return (np.clip(data, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    except ImportError:
        pass

    import array

    samples = [float(x) for x in wav]
    peak = max((abs(x) for x in samples), default=0.0)
    scale = 1.0 / peak if peak > 1.0 else 1.0
    pcm = array.array(
        "h",
        (int(max(-1.0, min(1.0, x * scale)) * 32767.0) for x in samples),
    )
    if sys.byteorder == "big":
        pcm.byteswap()
    return pcm.tobytes()


def _wav_is_silent(path: Path) -> bool:
    """mock 무음 캐시(1초 제로 PCM)인지. 실제 모드에서 재사용하면 안 된다."""
    import wave

    try:
        with wave.open(str(path), "rb") as wf:
            raw = wf.readframes(wf.getnframes())
    except Exception:
        return False
    return (not raw) or raw == b"\x00" * len(raw)


def _write_wav(path: Path, wav: Any, sample_rate: int) -> None:
    """generate_voice_clone이 돌려준 float 파형을 16bit PCM wav로 저장."""
    import wave

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(_pcm16_bytes(wav))


def _silence_wav_bytes(seconds: float = 1.0, sample_rate: int = 22050) -> bytes:
    import struct
    import wave

    n_frames = max(1, int(seconds * sample_rate))
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
        path = f.name

    try:
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            silence = struct.pack("<h", 0)
            wf.writeframes(silence * n_frames)
        return Path(path).read_bytes()
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass


def clear_generated_audio_cache(
    output_dir: Path | None = None,
    *,
    max_age_sec: float = 7 * 24 * 3600,
) -> int:
    """오래된 생성 음성 파일 삭제. 삭제 개수 반환."""
    target = output_dir or (CONFIG.iris_home_dir / "audio" / "generated")
    if not target.is_dir():
        return 0
    now = time.time()
    removed = 0
    for path in target.glob("*.wav"):
        try:
            if now - path.stat().st_mtime > max_age_sec:
                path.unlink()
                removed += 1
        except OSError:
            continue
    return removed


@dataclass(frozen=True)
class SpeechResult:
    audio_path: str
    text: str
    tone: str = ""


class TTSService:
    """
    Qwen3-TTS zero-shot voice cloning (voice_prompt 준비 → 생성).

    - GUI 스레드 로딩 금지: 이 서비스 안에서만 lazy load
    - ref_audio/ref_text가 바뀌면 voice_prompt_hash 변경 → 캐시 재생성
    """

    def __init__(self, model_manager: VoiceModelManager) -> None:
        self._mm = model_manager
        self._profile: VoiceProfile | None = None
        self._profile_loaded = False

    # ---- 보이스 프로필 -----------------------------------------------------

    @property
    def profile(self) -> VoiceProfile | None:
        """저장소에 커밋된 IRIS 보이스 프로필. 없으면 None."""
        if not self._profile_loaded:
            self._profile = load_default_profile()
            self._profile_loaded = True
        return self._profile

    def profile_info(self) -> dict[str, Any]:
        profile = self.profile
        if profile is None:
            return {"available": False, "tones": {}}
        return {
            "available": True,
            "name": profile.name,
            "model_name": profile.model_name,
            "dim": profile.dim,
            "tones": {
                tone: {
                    "sample_count": ref.sample_count,
                    "supports_icl": ref.supports_icl,
                    "ref_text": ref.ref_text,
                }
                for tone, ref in profile.tones.items()
            },
            "meta": profile.meta,
        }

    def profile_prompt_hash(self, tone: str) -> str:
        profile = self.profile
        name = profile.name if profile is not None else "none"
        return f"{PROFILE_PROMPT_PREFIX}:{name}:{tone}"

    def resolve_tone(self, text: str, requested: str | None = None) -> str:
        """요청 톤이 프로필에 있으면 그대로, 없으면 텍스트에서 추론."""
        profile = self.profile
        if profile is None:
            return TONE_NEUTRAL
        if requested and requested in profile.tones:
            return requested
        tone = classify_text_tone(text)
        return tone if tone in profile.tones else TONE_NEUTRAL

    def _build_profile_prompt_item(self, tone: str) -> Any:
        """저장된 x-vector/ref_code로 VoiceClonePromptItem을 직접 만든다.

        녹음 원본이 없어도 되는 이유가 여기 있다. create_voice_clone_prompt는
        오디오에서 이 두 값을 뽑을 뿐이고, 생성 경로는 값만 있으면 동작한다.
        """
        import torch
        from qwen_tts.inference.qwen3_tts_model import VoiceClonePromptItem  # type: ignore

        profile = self.profile
        if profile is None:
            raise RuntimeError("보이스 프로필이 없습니다.")
        ref = profile.tone_reference(tone)
        x_vector = profile.x_vector_for(tone)

        spk = torch.from_numpy(x_vector.copy()).float()
        if ref is not None and ref.supports_icl:
            return VoiceClonePromptItem(
                ref_code=torch.from_numpy(ref.ref_code.copy()).long(),  # type: ignore[union-attr]
                ref_spk_embedding=spk,
                x_vector_only_mode=False,
                icl_mode=True,
                ref_text=ref.ref_text,
            )
        return VoiceClonePromptItem(
            ref_code=None,
            ref_spk_embedding=spk,
            x_vector_only_mode=True,
            icl_mode=False,
            ref_text=None,
        )

    def prepare_profile_prompt(self, tone: str) -> PreparedVoiceClone:
        """톤별 프로필 프롬프트를 만들어 캐시한다. 모델 로딩이 필요 없다."""
        if self.profile is None:
            raise RuntimeError(
                "보이스 프로필이 없습니다. scripts/build_voice_profile.py 로 먼저 생성하세요."
            )
        prompt_hash = self.profile_prompt_hash(tone)
        cached = self._mm.get_prepared_voice(prompt_hash)
        if cached is not None:
            return cached

        if CONFIG.mock_mode:
            prepared = PreparedVoiceClone(
                voice_prompt_hash=prompt_hash,
                voice_clone_prompt={"mock": True, "tone": tone},
            )
        else:
            prepared = PreparedVoiceClone(
                voice_prompt_hash=prompt_hash,
                voice_clone_prompt=[self._build_profile_prompt_item(tone)],
            )
        self._mm.set_prepared_voice(prepared)
        return prepared

    # ---- 모델 ------------------------------------------------------------

    def _get_tts_model_key(self, model_name: str) -> str:
        return model_name

    def _ensure_tts_model(self, model_name: str) -> Any:
        key = self._get_tts_model_key(model_name)

        def _load() -> Any:
            try:
                from qwen_tts import Qwen3TTSModel  # type: ignore
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(
                    "qwen-tts가 설치되지 않았습니다. "
                    "scripts/setup_voice_runtime 으로 .venv-voice를 구성하세요."
                ) from exc

            # bf16 미지원 GPU(예: GTX 1060)는 float32와 SDPA를 사용한다.
            load_kwargs: dict[str, Any] = {}
            try:
                import torch

                if torch.cuda.is_available():
                    load_kwargs = {
                        "device_map": "cuda:0",
                        "dtype": torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float32,
                        "attn_implementation": "sdpa",
                    }
                else:
                    load_kwargs = {"device_map": "cpu", "dtype": torch.float32}
            except Exception:  # noqa: BLE001
                load_kwargs = {}

            try:
                return Qwen3TTSModel.from_pretrained(model_name, **load_kwargs)
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"TTS 모델 로딩 실패 ({model_name}): {exc}") from exc

        return self._mm.get_or_load_tts(key, _load)

    def _voice_prompt_hash(self, ref_audio_path: str, ref_text: str) -> str:
        mode = "xvec" if TTS_X_VECTOR_ONLY_MODE else "icl"
        return _sha256_text(f"{ref_audio_path}::{ref_text}::{mode}")

    def prepare_voice_clone_prompt(
        self,
        *,
        ref_audio_path: str,
        ref_text: str,
        tts_model_name: str,
        voice_prompt_hash: str | None = None,
    ) -> PreparedVoiceClone:
        ref_path = Path(ref_audio_path)
        if not ref_path.is_file():
            raise RuntimeError(f"기준 음성 파일이 없습니다: {ref_audio_path}")
        if not (ref_text or "").strip():
            raise RuntimeError("기준 대본(ref_text)이 비어 있습니다.")

        if not voice_prompt_hash:
            voice_prompt_hash = self._voice_prompt_hash(ref_audio_path, ref_text)

        cached = self._mm.get_prepared_voice(voice_prompt_hash)
        if cached is not None:
            return cached

        if CONFIG.mock_mode:
            prepared = PreparedVoiceClone(
                voice_prompt_hash=voice_prompt_hash, voice_clone_prompt={"mock": True}
            )
            self._mm.set_prepared_voice(prepared)
            return prepared

        tts_model = self._ensure_tts_model(tts_model_name)
        prompt = tts_model.create_voice_clone_prompt(
            ref_audio=ref_audio_path,
            ref_text=ref_text,
            x_vector_only_mode=TTS_X_VECTOR_ONLY_MODE,
        )
        prepared = PreparedVoiceClone(
            voice_prompt_hash=voice_prompt_hash, voice_clone_prompt=prompt
        )
        self._mm.set_prepared_voice(prepared)
        return prepared

    def synthesize_speech(
        self,
        *,
        text: str,
        voice_prompt_hash: str,
        tts_model_name: str,
        output_dir: Path,
        tone: str | None = None,
    ) -> SpeechResult:
        if not (text or "").strip():
            raise RuntimeError("TTS 텍스트가 비어 있습니다.")

        use_profile = self._should_use_profile(voice_prompt_hash)
        resolved_tone = ""
        if use_profile:
            resolved_tone = self.resolve_tone(text, tone)
            prepared = self.prepare_profile_prompt(resolved_tone)
            voice_prompt_hash = prepared.voice_prompt_hash
        else:
            if not (voice_prompt_hash or "").strip():
                raise RuntimeError(
                    "보이스 프로필이 없고 voice_prompt_hash도 비어 있습니다. "
                    "scripts/build_voice_profile.py 로 프로필을 만들거나, "
                    "기준 음성을 고른 뒤 /v1/voice/prepare 를 호출하세요."
                )
            prepared = self._mm.get_prepared_voice(voice_prompt_hash)

        output_dir.mkdir(parents=True, exist_ok=True)
        cache_key = f"{voice_prompt_hash}::{text}"
        h = hashlib.sha256(cache_key.encode("utf-8", errors="ignore")).hexdigest()
        out_path = output_dir / f"{h}.wav"

        if CONFIG.mock_mode:
            if not out_path.is_file():
                out_path.write_bytes(_silence_wav_bytes(1.0))
            return SpeechResult(audio_path=str(out_path), text=text, tone=resolved_tone)

        # 같은 톤·같은 문장이면 이미 만든 파일을 그대로 쓴다.
        # 이 노트북은 RTF가 8배라 재생성 비용이 크다.
        # mock이 남긴 무음 파일은 캐시로 치지 않는다.
        if out_path.is_file() and out_path.stat().st_size > 0 and not _wav_is_silent(out_path):
            return SpeechResult(audio_path=str(out_path), text=text, tone=resolved_tone)

        if prepared is None or prepared.voice_clone_prompt is None:
            raise RuntimeError(
                "voice clone prompt가 없습니다. 기준 음성을 다시 확정한 뒤 prepare를 호출하세요."
            )

        tts_model = self._ensure_tts_model(tts_model_name)
        generate_kwargs: dict[str, Any] = {
            "text": text,
            "language": TTS_LANGUAGE,
            "voice_clone_prompt": prepared.voice_clone_prompt,
        }
        # 프로필 경로는 프롬프트 아이템이 모드를 이미 들고 있다.
        # 여기서 x_vector_only_mode를 덮어쓰면 ICL 참조가 무시된다.
        if not use_profile:
            generate_kwargs["x_vector_only_mode"] = TTS_X_VECTOR_ONLY_MODE

        # generate_voice_clone은 파일 경로가 아니라 (파형 리스트, sample_rate)를 돌려준다.
        generated = tts_model.generate_voice_clone(**generate_kwargs)
        try:
            wavs, sample_rate = generated
            wav = wavs[0]
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"TTS 생성 결과 형식을 알 수 없습니다: {type(generated)!r}"
            ) from exc

        _write_wav(out_path, wav, sample_rate)
        return SpeechResult(audio_path=str(out_path), text=text, tone=resolved_tone)

    def _should_use_profile(self, voice_prompt_hash: str) -> bool:
        """빈 해시이거나 profile: 해시면 프로필 경로를 쓴다."""
        value = (voice_prompt_hash or "").strip()
        if self.profile is None:
            return False
        return not value or value.startswith(f"{PROFILE_PROMPT_PREFIX}:")
