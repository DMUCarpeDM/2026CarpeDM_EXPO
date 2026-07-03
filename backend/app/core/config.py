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

    model_config = {"env_prefix": "MIRROTING_", "env_file": ".env"}


settings = Settings()
settings.media_dir.mkdir(parents=True, exist_ok=True)
