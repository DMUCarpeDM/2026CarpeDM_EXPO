from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, codes, reports, scenarios, sessions
from app.core.config import settings
from app.seed.run import seed


def _purge_expired_media() -> None:
    """보관 기간이 지난 음성 파일 정리 (S-CBYKOH — 익명/계정 저장 동의분)."""
    import time

    cutoff = time.time() - settings.media_retention_days * 86400
    removed = 0
    for f in settings.media_dir.glob("*.wav"):
        if f.stat().st_mtime < cutoff:
            f.unlink(missing_ok=True)
            removed += 1
    if removed:
        print(f"보관 기간 만료 음성 {removed}건 삭제")


def _prewarm_models() -> None:
    """모델 예열 — 첫 체험자가 로드 비용(수십 초)을 내지 않게 한다 (전시 운영).

    백그라운드 스레드에서 실행: STT(whisper/vosk) 로드 + Ollama 대화/임베딩
    모델을 RAM에 올린다(keep_alive 적용). 없는 구성 요소는 조용히 건너뛴다.
    """
    import httpx

    from app.ai.stt import get_stt_provider

    provider = get_stt_provider()
    print(f"[prewarm] 서버 STT: {provider.name if provider else '없음 (Web Speech 전용)'}")

    if settings.dialogue_provider == "ollama":
        try:
            httpx.post(
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": [{"role": "user", "content": "준비"}],
                    "stream": False,
                    "keep_alive": settings.ollama_keep_alive,
                    "options": {"num_predict": 1},
                },
                timeout=120,  # 콜드 로드 허용 — 예열이므로 요청 경로와 무관
            )
            print(f"[prewarm] 대화 모델 상주: {settings.ollama_model}")
        except Exception:
            print("[prewarm] Ollama 대화 모델 없음 → 템플릿 엔진으로 동작")
    if settings.semantic_match_enabled:
        try:
            httpx.post(
                f"{settings.ollama_base_url}/api/embeddings",
                json={
                    "model": settings.ollama_embed_model, "prompt": "준비",
                    "keep_alive": settings.ollama_keep_alive,
                },
                timeout=120,
            )
            print(f"[prewarm] 임베딩 모델 상주: {settings.ollama_embed_model}")
        except Exception:
            print("[prewarm] Ollama 임베딩 없음 → 키워드 매칭만 사용")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()  # 테이블 생성 + 시나리오 시드 (멱등)
    _purge_expired_media()
    import threading

    threading.Thread(target=_prewarm_models, daemon=True).start()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, scenarios.router, sessions.router, reports.router, admin.router, codes.router):
    app.include_router(router, prefix="/api")


@app.get("/api/health")
def health():
    from app.ai.stt import get_stt_provider

    provider = get_stt_provider()
    return {
        "ok": True,
        "app": settings.app_name,
        "server_stt": provider.name if provider else None,
        "dialogue_provider": settings.dialogue_provider,
    }
