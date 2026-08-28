"""프로젝트에 포함된 fine-tuned multilingual-E5 임베딩 모델 로더."""
from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

_model: SentenceTransformer | None = None
_model_lock = threading.Lock()


def _load_model() -> SentenceTransformer:
    """모델을 처음 사용할 때만 로드한다."""
    global _model
    with _model_lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(
                str(settings.local_e5_model_dir),
                local_files_only=True,
            )
    return _model


def available() -> bool:
    """설정된 로컬 모델을 로드할 수 있는지 확인한다."""
    if not settings.local_e5_model_dir.is_dir():
        return False
    try:
        _load_model()
    except (ImportError, OSError, RuntimeError, ValueError):
        return False
    return True


def embed_many(texts: list[str]) -> dict[str, tuple[float, ...]]:
    """정규화된 E5 임베딩을 입력 문장과 같은 순서로 반환한다."""
    if not texts or not available():
        return {}
    vectors = _load_model().encode(texts, normalize_embeddings=True)
    return {text: tuple(map(float, vector)) for text, vector in zip(texts, vectors, strict=True)}
