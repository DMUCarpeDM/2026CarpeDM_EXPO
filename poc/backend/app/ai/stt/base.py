"""STT 제공자 — 전시장 오프라인 대비 서버 음성 인식.

기본 흐름은 브라우저 Web Speech API가 클라이언트에서 텍스트를 만들어 보내지만,
Web Speech는 인터넷이 필요하다(Chrome은 서버 인식). 전시장 네트워크가 불안하면
서버 STT가 폴백으로 동작한다.

우선순위:
1. faster-whisper  — 정확도 높음. Python 3.12 이하에서 `pip install faster-whisper`
2. Vosk            — Python 3.14에서도 동작. `python scripts/setup_offline_stt.py`로
                     한국어 모델(~82MB)을 받아두면 자동 감지된다. 완전 오프라인.
"""
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import numpy as np

from app.core.config import settings

VOSK_SAMPLE_RATE = 16000

# base.py = app/ai/stt/ → 세 단계 위가 backend 루트
BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _resolve_local_dir(value: str | Path) -> Path | None:
    """설정값이 로컬 모델 디렉터리를 가리키면 절대 경로로 해석한다.

    상대 경로는 CWD가 아니라 backend 루트 기준으로도 찾아, uvicorn을 어디서
    띄우든 동작한다. 저장소 폴더명이 바뀌어 .env의 절대 경로가 낡은 경우
    (전시 PC에서 실제 발생)에도 `models/` 이하 꼬리를 backend 루트에 재접합해
    구제한다. 디렉터리가 아니면 None — 호출부가 크기 이름("small")으로 취급.
    """
    p = Path(value)
    candidates = [p] if p.is_absolute() else [p, BACKEND_ROOT / p]
    if p.is_absolute() and not p.exists() and "models" in p.parts:
        tail = Path(*p.parts[p.parts.index("models"):])
        candidates.append(BACKEND_ROOT / tail)
    for c in candidates:
        if c.is_dir():
            return c.resolve()
    return None


class SttProvider(Protocol):
    name: str

    def transcribe(self, audio_path: str) -> str: ...

    # 선택 능력: 단어 타임스탬프 — 텍스트-음성 정렬 분석(voice_align)의 재료.
    # 지원 여부는 hasattr로 확인한다.
    #   transcribe_words(audio_path) -> [{"word", "start", "end", "conf"}]


class WhisperProvider:
    name = "whisper"

    def __init__(self, model_size: str | None = None):
        from faster_whisper import WhisperModel  # 선택 의존성

        configured = model_size or settings.stt_whisper_model
        local_dir = _resolve_local_dir(configured)
        if local_dir is not None and str(local_dir) != str(configured):
            print(f"[stt] Whisper 로컬 모델 경로 해석: {configured} → {local_dir}")
        self._model = WhisperModel(
            str(local_dir) if local_dir else str(configured),
            device="cpu", compute_type="int8",
        )

    @staticmethod
    def _prompt_kwargs() -> dict:
        """핫워드 부스팅 (STT 최적화 R1) — 도메인 어휘를 initial_prompt로 조건화.

        브랜드 메뉴명("온도라떼")·사내 용어가 일반어로 오전사되는 것을 줄인다.
        최종 전사(transcribe/transcribe_words)에만 적용 — 실시간 조각(live)은
        3초 안팎이라 조건화가 환청을 증폭시킬 수 있고 지연이 우선이라 제외한다.
        """
        prompt = (settings.stt_initial_prompt or "").strip()
        return {"initial_prompt": prompt} if prompt else {}

    def transcribe(self, audio_path: str) -> str:
        segments, _info = self._model.transcribe(
            audio_path, language="ko", **self._prompt_kwargs(),
        )
        return " ".join(seg.text.strip() for seg in segments)

    def transcribe_live(self, audio_path: str) -> str:
        """실시간 조각용 저지연 전사 — 탐욕 디코딩(beam 1)·이전 문맥 조건화 해제.
        3초 안팎 조각은 빔 서치 이득이 거의 없고, 문맥 조건화는 조각 경계에서
        직전 환청을 증폭시키므로 끄는 쪽이 지연·품질 모두 낫다."""
        segments, _info = self._model.transcribe(
            audio_path, language="ko", beam_size=1,
            condition_on_previous_text=False, without_timestamps=True,
        )
        return " ".join(seg.text.strip() for seg in segments)

    def transcribe_words(self, audio_path: str) -> list[dict]:
        segments, _info = self._model.transcribe(
            audio_path, language="ko", word_timestamps=True, **self._prompt_kwargs(),
        )
        return [
            {"word": w.word.strip(), "start": w.start, "end": w.end,
             "conf": getattr(w, "probability", 1.0)}
            for seg in segments for w in (seg.words or [])
            if w.word.strip()
        ]


class VoskProvider:
    name = "vosk"

    def __init__(self):
        import vosk

        vosk.SetLogLevel(-1)
        model_dir = settings.stt_model_dir
        if not (model_dir / "am").exists() and not (model_dir / "conf").exists():
            raise FileNotFoundError(f"Vosk 모델이 없습니다: {model_dir}")
        self._vosk = vosk
        self._model = vosk.Model(str(model_dir))

    @staticmethod
    def _load_pcm16(audio_path: str) -> bytes:
        import soundfile as sf

        samples, sr = sf.read(audio_path, dtype="float32", always_2d=False)
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        if sr != VOSK_SAMPLE_RATE:  # 선형 보간 리샘플 (STT 용도로 충분)
            duration = len(samples) / sr
            n_target = int(duration * VOSK_SAMPLE_RATE)
            samples = np.interp(
                np.linspace(0, len(samples) - 1, n_target),
                np.arange(len(samples)),
                samples,
            )
        return (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()

    def _run(self, audio_path: str, with_words: bool) -> tuple[str, list[dict]]:
        import json as _json

        pcm16 = self._load_pcm16(audio_path)
        rec = self._vosk.KaldiRecognizer(self._model, VOSK_SAMPLE_RATE)
        if with_words:
            rec.SetWords(True)
        chunk = VOSK_SAMPLE_RATE * 2  # 1초 단위
        texts: list[str] = []
        words: list[dict] = []

        def _collect(payload: dict) -> None:
            if payload.get("text"):
                texts.append(payload["text"])
            for w in payload.get("result", []):
                words.append({
                    "word": w.get("word", ""), "start": w.get("start", 0.0),
                    "end": w.get("end", 0.0), "conf": w.get("conf", 1.0),
                })

        for i in range(0, len(pcm16), chunk):
            if rec.AcceptWaveform(pcm16[i:i + chunk]):
                _collect(_json.loads(rec.Result()))
        _collect(_json.loads(rec.FinalResult()))
        return " ".join(texts).strip(), words

    def transcribe(self, audio_path: str) -> str:
        text, _ = self._run(audio_path, with_words=False)
        return text

    def transcribe_words(self, audio_path: str) -> list[dict]:
        """단어 타임스탬프 — 텍스트-음성 정렬 분석(voice_align)의 재료."""
        _, words = self._run(audio_path, with_words=True)
        return words


@lru_cache(maxsize=1)
def get_stt_provider() -> SttProvider | None:
    """사용 가능한 첫 제공자를 캐시해 반환 (모델 로드는 1회).

    Whisper 실패는 ImportError(미설치)만이 아니라 모델 경로/로드 오류도
    있을 수 있다 — 어떤 실패든 Vosk로 강등해야 /api/health·분석 경로가
    산 채로 남는다(폴백 계층 원칙). 원인은 로그로 남겨 당일 점검에서 보이게 한다.
    """
    try:
        return WhisperProvider()
    except ImportError:
        pass
    except Exception as exc:
        print(f"[stt] Whisper 로드 실패 → Vosk 폴백 시도: {type(exc).__name__}: {exc}")
    try:
        return VoskProvider()
    except Exception:
        return None
