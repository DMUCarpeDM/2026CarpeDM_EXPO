"""IRIS 보이스 프로필 — 녹음본에서 뽑은 화자 임베딩과 톤별 참조를 담는 산출물.

녹음 원본(m4a)은 저장소에 커밋하지 않는다(.gitignore). 대신 이 프로필만 커밋하면
원본 오디오 없이도 같은 목소리로 합성된다. 프로필에 들어가는 것은:

  - base_x_vector : 전체 녹음 화자 임베딩의 이상치 제거 평균 (음색의 기준)
  - 톤별 x_vector : 상황별(질문/브리핑/경고/숫자/낭독/담담) 평균 임베딩
  - 톤별 ref_code : 대표 녹음 1개의 스피치 코드. ICL 모드에서 억양·속도를 복제한다
  - 톤별 ref_text : 그 대표 녹음의 전사문 (ICL에 필요)

ref_code/x_vector는 모두 작은 배열이라 npz로 수백 KB면 담긴다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from .tone_router import TONES

PROFILE_VERSION = 1

# 프로필은 모델별 임베딩 공간에 묶인다. 다른 모델로 만든 프로필을 쓰면 음색이 깨진다.
DEFAULT_PROFILE_MODEL = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"


@dataclass
class ToneReference:
    tone: str
    x_vector: np.ndarray  # (D,) float32
    ref_code: np.ndarray | None  # (T, Q) int32 — ICL용, 없으면 x-vector 전용
    ref_text: str
    source_file: str
    sample_count: int
    ref_duration: float = 0.0

    @property
    def supports_icl(self) -> bool:
        return self.ref_code is not None and bool((self.ref_text or "").strip())


@dataclass
class VoiceProfile:
    name: str
    model_name: str
    base_x_vector: np.ndarray  # (D,) float32
    tones: dict[str, ToneReference] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)
    version: int = PROFILE_VERSION

    @property
    def dim(self) -> int:
        return int(self.base_x_vector.shape[-1]) if self.base_x_vector.size else 0

    def tone_reference(self, tone: str) -> ToneReference | None:
        """요청한 톤이 없으면 None. 호출 측에서 base로 폴백한다."""
        return self.tones.get(tone)

    def x_vector_for(self, tone: str | None) -> np.ndarray:
        if tone:
            ref = self.tones.get(tone)
            if ref is not None:
                return ref.x_vector
        return self.base_x_vector

    # ---- 직렬화 ----------------------------------------------------------

    def save(self, npz_path: Path, *, json_path: Path | None = None) -> None:
        npz_path.parent.mkdir(parents=True, exist_ok=True)
        arrays: dict[str, np.ndarray] = {
            "base_x_vector": self.base_x_vector.astype(np.float32, copy=False)
        }
        manifest: dict[str, Any] = {
            "version": self.version,
            "name": self.name,
            "model_name": self.model_name,
            "dim": self.dim,
            "tones": {},
            "meta": self.meta,
        }
        for tone, ref in self.tones.items():
            arrays[f"tone.{tone}.x_vector"] = ref.x_vector.astype(np.float32, copy=False)
            if ref.ref_code is not None:
                arrays[f"tone.{tone}.ref_code"] = ref.ref_code.astype(np.int32, copy=False)
            manifest["tones"][tone] = {
                "ref_text": ref.ref_text,
                "source_file": ref.source_file,
                "sample_count": ref.sample_count,
                "ref_duration": round(float(ref.ref_duration), 3),
                "supports_icl": ref.supports_icl,
            }

        np.savez_compressed(npz_path, **arrays)
        target_json = json_path or npz_path.with_suffix(".json")
        target_json.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    @classmethod
    def load(cls, npz_path: Path, *, json_path: Path | None = None) -> "VoiceProfile":
        source_json = json_path or npz_path.with_suffix(".json")
        if not npz_path.is_file():
            raise FileNotFoundError(f"보이스 프로필이 없습니다: {npz_path}")
        if not source_json.is_file():
            raise FileNotFoundError(f"보이스 프로필 메타가 없습니다: {source_json}")

        manifest = json.loads(source_json.read_text(encoding="utf-8"))
        with np.load(npz_path) as data:
            base = np.asarray(data["base_x_vector"], dtype=np.float32)
            tones: dict[str, ToneReference] = {}
            for tone, info in (manifest.get("tones") or {}).items():
                x_key = f"tone.{tone}.x_vector"
                if x_key not in data:
                    continue
                code_key = f"tone.{tone}.ref_code"
                ref_code = (
                    np.asarray(data[code_key], dtype=np.int32) if code_key in data else None
                )
                tones[tone] = ToneReference(
                    tone=tone,
                    x_vector=np.asarray(data[x_key], dtype=np.float32),
                    ref_code=ref_code,
                    ref_text=str(info.get("ref_text") or ""),
                    source_file=str(info.get("source_file") or ""),
                    sample_count=int(info.get("sample_count") or 0),
                    ref_duration=float(info.get("ref_duration") or 0.0),
                )

        return cls(
            name=str(manifest.get("name") or "iris"),
            model_name=str(manifest.get("model_name") or DEFAULT_PROFILE_MODEL),
            base_x_vector=base,
            tones=tones,
            meta=dict(manifest.get("meta") or {}),
            version=int(manifest.get("version") or PROFILE_VERSION),
        )


# ---- 임베딩 집계 -----------------------------------------------------------


def average_embeddings(
    vectors: list[np.ndarray],
    *,
    outlier_z: float = 2.0,
) -> tuple[np.ndarray, list[int]]:
    """코사인 유사도 기준 이상치를 뺀 평균을 낸다.

    녹음 중에는 마이크가 멀거나 잡음이 섞인 게 섞여 있다. 그대로 평균내면
    음색이 흐려지므로, 중심에서 z-score 이상 떨어진 샘플을 뺀 뒤 다시 평균낸다.

    반환: (평균 벡터, 사용된 인덱스)
    """
    if not vectors:
        raise ValueError("임베딩이 비어 있습니다.")
    stacked = np.stack([np.asarray(v, dtype=np.float32).reshape(-1) for v in vectors])
    if stacked.shape[0] <= 2:
        return stacked.mean(axis=0), list(range(stacked.shape[0]))

    normed = stacked / (np.linalg.norm(stacked, axis=1, keepdims=True) + 1e-8)
    centroid = normed.mean(axis=0)
    centroid /= np.linalg.norm(centroid) + 1e-8
    similarity = normed @ centroid

    mean = float(similarity.mean())
    std = float(similarity.std())
    if std < 1e-6:
        return stacked.mean(axis=0), list(range(stacked.shape[0]))

    keep = np.nonzero(similarity >= mean - outlier_z * std)[0]
    if keep.size == 0:
        keep = np.arange(stacked.shape[0])
    return stacked[keep].mean(axis=0), [int(i) for i in keep]


def most_central_index(vectors: list[np.ndarray]) -> int:
    """중심(medoid)에 가장 가까운 샘플의 인덱스. 톤 대표 녹음 고르는 데 쓴다."""
    if not vectors:
        raise ValueError("임베딩이 비어 있습니다.")
    stacked = np.stack([np.asarray(v, dtype=np.float32).reshape(-1) for v in vectors])
    normed = stacked / (np.linalg.norm(stacked, axis=1, keepdims=True) + 1e-8)
    centroid = normed.mean(axis=0)
    centroid /= np.linalg.norm(centroid) + 1e-8
    return int(np.argmax(normed @ centroid))


def default_profile_paths() -> tuple[Path, Path]:
    """저장소에 커밋된 기본 프로필 경로 (npz, json)."""
    assets = Path(__file__).resolve().parents[2] / "iris" / "assets" / "voice"
    return assets / "iris_voice_profile.npz", assets / "iris_voice_profile.json"


def load_default_profile() -> VoiceProfile | None:
    """기본 프로필을 읽는다. 없으면 None (기존 단일 레퍼런스 경로로 폴백)."""
    npz_path, json_path = default_profile_paths()
    if not npz_path.is_file() or not json_path.is_file():
        return None
    try:
        return VoiceProfile.load(npz_path, json_path=json_path)
    except Exception:
        return None


__all__ = [
    "PROFILE_VERSION",
    "DEFAULT_PROFILE_MODEL",
    "ToneReference",
    "VoiceProfile",
    "TONES",
    "average_embeddings",
    "most_central_index",
    "default_profile_paths",
    "load_default_profile",
]
