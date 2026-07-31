from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "4-Fit Mirror-Ting API"
    database_url: str = "sqlite:///./mirror-ting.db"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    media_dir: Path = Path("./media")
    # 운영 API(/api/admin: 전시 초기화·CSV 내보내기) 보호 토큰 — X-Admin-Token 헤더로 대조.
    # 비우면 무인증(개발 편의). 전시장 네트워크에 열 때는 반드시 설정할 것.
    admin_token: str = ""
    # 전시/운영 배포 안전장치 — True면 기본 JWT 시크릿·빈 admin 토큰으로 기동을 거부한다.
    require_secure: bool = False
    # 익명/계정 저장 동의 시 음성 파일 보관 일수 (S-CBYKOH). '미저장' 동의는 분석 직후 삭제.
    media_retention_days: int = 7
    # 관리자 API(/admin/*) 인증 강제 여부 — 전시 키오스크는 False(로컬 단독 운영),
    # 기관 납품 시 True + role='admin' 계정 필수 (app.seed.make_admin으로 승격)
    admin_auth_required: bool = False

    # 서버 STT(오프라인 폴백)용 Vosk 한국어 모델 경로 — scripts/setup_offline_stt.py로 다운로드
    stt_model_dir: Path = Path("./models/vosk-ko")
    # faster-whisper 모델 크기 — i7-8750H 실측(21s 한국어): small CER 4.8%/RTF 0.28,
    # base CER 10.8%/RTF 0.24, vosk-small-ko CER 47.6%. 속도 차이가 미미해 small 기본.
    stt_whisper_model: str = "small"
    # STT 핫워드 부스팅 (S-B2B-PARA, STT 최적화 R1) — 도메인 고유 어휘를 디코더에
    # 조건화해 브랜드 메뉴명·사내 용어의 오전사(온도라떼→온도 라테/라떼 등)를 줄인다.
    # 시나리오 팩을 추가하면 그 팩의 고유 명사를 여기 덧붙인다. 비우면 비활성.
    stt_initial_prompt: str = (
        "카페 온도, 온도라떼, 유자온도, 온도 콜드브루, 크림 온도, 온도 포인트, "
        "클라우드밋, 플로우데스크, 에스컬레이션, 러시타임"
    )

    # 대화 엔진: 전시 시뮬레이션은 로컬 Ollama를 기본으로 사용한다.
    dialogue_provider: str = "ollama"
    # 세션 시작 게이트: True면 Ollama 미가동 시 새 체험 시작을 막는다(운영자가 즉시
    # 인지·복구하도록). False면 템플릿 대본으로 시작을 허용한다(무인 운영 우선).
    # 어느 쪽이든 진행 중 세션은 Ollama가 죽어도 템플릿 폴백으로 끊기지 않는다.
    dialogue_require_ollama: bool = True
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

    # ---- B2B 온보딩 확장 ----
    # NFC 리더 브리지 (S-B2B-NFC) — ACR122U PC/SC 폴링. pyscard 미설치·리더 미연결이면
    # 자동 휴면하고 수동 폴백(simulate-tap·수동 카드 선택)만 동작한다.
    nfc_bridge_enabled: bool = True
    # 리더 연결 순서(인덱스)로 역할 배정 — 1대 운영 시 "mirror"만
    nfc_reader_roles: str = "mirror,kiosk"
    # 영수증 QR 클레임 링크 베이스 (S-B2B-CLAIM) — 웹앱(poc/frontend)의 클레임 화면.
    # QR에는 claim_token만 실린다 (세션 열람권인 access_token은 싣지 않는다).
    claim_base_url: str = "http://localhost:5173/claim"
    # LLM judge (S-B2B-JUDGE): Response-Fit 한정 루브릭 CoT 채점 + self-consistency
    # (n회 채점 중앙값). 0이면 비활성. Ollama 미가동·실패 시 결정적 파이프라인 점수만
    # 사용한다 (폴백 계층 원칙 — judge는 가산 레이어지 의존점이 아니다).
    judge_samples: int = 3
    judge_timeout_sec: float = 20.0
    # 최종 Response 점수 = (1-w)×결정적 + w×judge 중앙값 — 보수적 혼합(검증 전)
    judge_blend_weight: float = 0.3

    # 떨림(jitter/shimmer) 감점 임계 — 합성 신호로 보정된 기본값. 감점 자체는
    # 골든 검증된 결함 수정(떨리는 발화가 억양 보상을 받던 문제)이므로 유지하되,
    # 전시 PC 마이크 보정(demo-checklist §2.5)에서 오탐이 보이면 코드 수정 없이
    # backend/.env의 MIRROR_TING_TREMOR_*로 상향한다.
    tremor_jitter_floor: float = 6.0   # % — 이하는 정상 변동
    tremor_shimmer_floor: float = 8.0  # %
    tremor_penalty_cap: float = 18.0

    model_config = {"env_prefix": "MIRROR_TING_", "env_file": ".env"}


settings = Settings()
settings.media_dir.mkdir(parents=True, exist_ok=True)
