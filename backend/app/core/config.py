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
    # 운영 API(/api/admin: 전시 초기화·CSV 내보내기) 보호 토큰 — X-Admin-Token 헤더로 대조.
    # 비우면 무인증(개발 편의). 전시장 네트워크에 열 때는 반드시 설정할 것.
    admin_token: str = ""
    # 익명/계정 저장 동의 시 음성 파일 보관 일수 (S-CBYKOH). '미저장' 동의는 분석 직후 삭제.
    media_retention_days: int = 7

    # 서버 STT(오프라인 폴백)용 Vosk 한국어 모델 경로 — scripts/setup_offline_stt.py로 다운로드
    stt_model_dir: Path = Path("./models/vosk-ko")
    # faster-whisper 모델 크기 — i7-8750H 실측(21s 한국어): small CER 4.8%/RTF 0.28,
    # base CER 10.8%/RTF 0.24, vosk-small-ko CER 47.6%. 속도 차이가 미미해 small 기본.
    stt_whisper_model: str = "small"

    # 대화 엔진: template(기본) | ollama(로컬 LLM으로 후속 질문 개인화, 실패 시 템플릿 폴백)
    dialogue_provider: str = "template"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "exaone3.5:2.4b"
    # i7-8750H 실측: 워밍 상태 개인화 질문 생성 3.6~4.7s(평균 4.1s) — p95+여유로 7s.
    # 초과 시 템플릿 질문으로 즉시 폴백하므로 상한일 뿐 평균 지연이 아니다.
    ollama_timeout_sec: float = 7.0
    # 전시 중 세션 간격이 벌어져도 모델이 RAM에서 내려가지 않게 (기본 5m → 콜드 로드 방지)
    ollama_keep_alive: str = "2h"

    # 의미 매칭 (마스터리 ②): 로컬 임베딩으로 패러프레이즈 커버리지 인식.
    # Ollama가 없으면 자동으로 키워드 매칭만 사용 (완전 폴백, API 키 무관).
    # 준비: ollama pull bge-m3  (한국어 포함 다국어 임베딩 — nomic-embed-text 대비 한국어 우수)
    semantic_match_enabled: bool = True
    ollama_embed_model: str = "bge-m3"

    model_config = {"env_prefix": "MIRROTING_", "env_file": ".env"}


settings = Settings()
settings.media_dir.mkdir(parents=True, exist_ok=True)
