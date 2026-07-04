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


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()  # 테이블 생성 + 시나리오 시드 (멱등)
    _purge_expired_media()
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
