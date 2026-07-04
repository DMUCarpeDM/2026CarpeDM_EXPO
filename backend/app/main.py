from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, codes, reports, scenarios, sessions
from app.core.config import settings
from app.seed.run import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()  # 테이블 생성 + 시나리오 시드 (멱등)
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
