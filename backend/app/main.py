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


def _recover_interrupted_analyses() -> None:
    """서버 재시작으로 중단된 분석 복구 — analyzing에 고착된 세션을 재큐잉.

    분석은 프로세스 내 BackgroundTask라 재시작 시 유실된다. 그대로 두면 진행률
    화면이 영원히 멈추고, 재시도 API는 stage=error 전용이라 거부한다.
    run_analysis는 멱등(부분 결과 삭제 후 재실행)이므로 재큐잉이 안전하다.
    SQLite 동시 쓰기 경합을 피해 한 스레드에서 순차 처리한다.
    """
    import threading

    from app.core.database import SessionLocal
    from app.models import RoleplaySession, SessionStatus
    from app.services.analysis import run_analysis

    db = SessionLocal()
    try:
        stuck = [
            row[0]
            for row in db.query(RoleplaySession.id)
            .filter(RoleplaySession.status == SessionStatus.analyzing)
            .all()
        ]
    finally:
        db.close()
    if not stuck:
        return
    print(f"[recover] 재시작으로 중단된 분석 {len(stuck)}건 재큐잉: {stuck}")

    def _resume() -> None:
        for session_id in stuck:
            run_analysis(session_id)

    threading.Thread(target=_resume, daemon=True).start()


def _assert_secure_config() -> None:
    """전시/운영 배포 안전장치 — require_secure면 안전하지 않은 설정으로 기동을 거부한다."""
    insecure = []
    if settings.jwt_secret == "change-me-in-production":
        insecure.append("MIRROTING_JWT_SECRET(기본값)")
    if not settings.admin_token:
        insecure.append("MIRROTING_ADMIN_TOKEN(미설정)")
    if settings.require_secure and insecure:
        raise RuntimeError("보안 설정 필요(require_secure=on): " + ", ".join(insecure))
    if settings.jwt_secret == "change-me-in-production":
        print("[warn] MIRROTING_JWT_SECRET 기본값 사용 — 계정 기능 배포 전 반드시 변경")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()  # 테이블 생성 + 시나리오 시드 (멱등)
    _purge_expired_media()
    _recover_interrupted_analyses()
    _assert_secure_config()
    if not settings.admin_token:
        print("[warn] MIRROTING_ADMIN_TOKEN 미설정 — 운영 API(/api/admin)는 로컬(같은 PC)에서만 접근 가능")
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
