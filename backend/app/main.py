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


# Ollama 상태 캐시 — health는 자주 불리므로 프로브는 60초에 한 번만
_OLLAMA_CACHE: dict = {"at": 0.0, "status": {"reachable": False, "dialogue": False, "embedding": False}}


def _ollama_status() -> dict:
    import time as _time

    import httpx

    now = _time.monotonic()
    if now - _OLLAMA_CACHE["at"] < 60:
        return _OLLAMA_CACHE["status"]
    status = {"reachable": False, "dialogue": False, "embedding": False}
    try:
        resp = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=1.5)
        resp.raise_for_status()
        names = {m.get("name", "") for m in resp.json().get("models", [])}
        stems = {n.split(":")[0] for n in names}
        status["reachable"] = True
        status["dialogue"] = settings.ollama_model in names \
            or settings.ollama_model.split(":")[0] in stems
        status["embedding"] = settings.ollama_embed_model in names \
            or settings.ollama_embed_model.split(":")[0] in stems
    except Exception:
        pass  # 미기동 → 전부 False (폴백 강등 상태를 그대로 보여준다)
    _OLLAMA_CACHE["at"] = now
    _OLLAMA_CACHE["status"] = status
    return status


@app.get("/api/health")
def health():
    from app.ai.stt import get_stt_provider

    provider = get_stt_provider()
    return {
        "ok": True,
        "app": settings.app_name,
        "server_stt": provider.name if provider else None,
        "dialogue_provider": settings.dialogue_provider,
        # 관측성: 지금 이 부스가 폴백으로 강등된 상태인지 즉시 확인 (60초 캐시)
        "ollama": _ollama_status(),
    }
