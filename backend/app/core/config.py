from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "4-Fit Mirror-Ting API"
    database_url: str = "sqlite:///./mirroting.db"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    media_dir: Path = Path("./media")

    # 서버 STT(오프라인 폴백)용 Vosk 한국어 모델 경로 — scripts/setup_offline_stt.py로 다운로드
    stt_model_dir: Path = Path("./models/vosk-ko")

    # 대화 엔진: template(기본) | ollama(로컬 LLM으로 후속 질문 개인화, 실패 시 템플릿 폴백)
    dialogue_provider: str = "template"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "exaone3.5:2.4b"
    ollama_timeout_sec: float = 2.5

    model_config = {"env_prefix": "MIRROTING_", "env_file": ".env"}


settings = Settings()
settings.media_dir.mkdir(parents=True, exist_ok=True)
