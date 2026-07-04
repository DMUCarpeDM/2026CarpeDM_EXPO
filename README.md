# 4-Fit 미러팅 (Mirror-Ting)

> 취준생을 위한 AI 기반 직장생활 시뮬레이션 및 코칭 시스템
> 2026 동양미래EXPO (제44회 졸업작품전시회) · CarpeDM (P.D.Lab)

가상 회사 **㈜클라우드밋**에 입사한 첫날, 고객사 장애가 터지는 하루를 AI 상사·선배·동료와
연속 역할극으로 체험하고, 4가지 지표(4-Fit)로 커뮤니케이션 피드백을 받는 시스템입니다.

| 지표 | 분석 대상 | 구현 |
|---|---|---|
| **Response-Fit** | 응답 내용 (체크리스트·위험 표현) | kiwipiepy + 전문가 설계 체크리스트 |
| **Voice-Fit** | 말속도·무음 비율·에너지 | numpy + soundfile (서버) |
| **Eye-Fit** | 정면 응시·시선 이탈 | MediaPipe Face Landmarker (브라우저) |
| **Posture-Fit** | 어깨 기울기·고개 숙임·흔들림 | MediaPipe Pose Landmarker (브라우저) |

**API 키 없이 동작합니다** — STT는 브라우저 Web Speech API, TTS는 speechSynthesis,
대화는 템플릿+규칙 기반 엔진, 영상 분석은 브라우저 내 MediaPipe(영상 원본은 서버로
전송하지 않음 — 스켈레톤 오버레이와 실시간 게이지로 분석 과정을 가시화).

### 하이브리드 AI 대화 (선택)

로컬 LLM(Ollama)을 켜면 후속·압박 질문이 사용자 답변을 반영해 개인화됩니다.
연결 실패·타임아웃·형식 오류 시 자동으로 템플릿 질문으로 폴백하므로 시연이 끊기지 않습니다.

```bash
# 1) https://ollama.com 설치 후 한국어 특화 공개 모델 다운로드
ollama pull exaone3.5:2.4b
# 2) 백엔드를 ollama 모드로 실행
MIRROTING_DIALOGUE_PROVIDER=ollama ./.venv/bin/uvicorn app.main:app --port 8000
```

### 전시장 오프라인 준비

```bash
cd frontend && npm run setup-offline   # MediaPipe wasm/모델을 public/에 다운로드 (1회)
```
이후 시선·자세 분석이 인터넷 없이 동작합니다 (로컬 자산 우선, 없으면 CDN 폴백).

## 실행 방법

### 백엔드 (FastAPI, Python 3.12+)

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn app.main:app --reload --port 8000
```

- 첫 기동 시 SQLite DB 생성 + 시나리오 시드 자동 실행
- API 문서: http://localhost:8000/docs
- 테스트: `./.venv/bin/python -m pytest tests`

### 프론트엔드 (React + Vite)

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

> 음성 인식(Web Speech API)은 **Chrome 계열 브라우저**에서 동작합니다.
> 카메라/마이크 권한을 거부해도 텍스트 입력으로 전체 흐름 체험이 가능합니다.

## 저장소 구조

```
docs/prd.json     Manyfast 기획서 원본 (요구사항 9 / 기능 31 / 스펙 78)
backend/
  app/core/       설정·DB·JWT
  app/models/     도메인 모델 (세션 FSM: ready→in_progress→analyzing→completed)
  app/seed/       세계관·등장인물 4인·에피소드 5종·체크리스트/금지어 시드
  app/services/   대화 엔진(dialogue/), 분석 오케스트레이션, 리포트 생성
  app/ai/         4-Fit 분석 모듈 + 점수화(0~100 정규화)
  app/api/        /auth /scenarios /sessions /reports /admin
frontend/
  src/features/onboarding/   동의·모드(5/10분)·난이도 선택
  src/features/roleplay/     대화 화면 · WebSpeech STT · TTS · MediaPipe 코칭 오버레이
  src/features/report/       분석 진행률 → 4-Fit 리포트 · 근거 구간 · 10초 재도전
  src/features/admin/        운영 대시보드 골격 (지표·1클릭 초기화)
  src/lib/                   stt.ts · tts.ts · recorder.ts(WAV 인코딩)
```

## 전시 운영 기능

- **운영 대시보드**(`/admin`): 완료율·재도전율·평균 점수, 1클릭 초기화, **CSV 내보내기**
- **전시 모드**: 대시보드에서 ON 하면 리포트 화면 90초 무조작 시 자동으로 대기 화면 복귀

## 다음 확장 (기획서 로드맵)

- faster-whisper 서버 STT (전시장 오프라인 STT 대비, `pip install faster-whisper`)
- 기관 대시보드 완성: 기간/시나리오/기기 필터, 익명 ID(QR) 연동
- 스마트 미러 세로형 키오스크 레이아웃, 하프미러 하드웨어 연동

## 참고

- Python 3.14 환경에서는 librosa(llvmlite 미지원) 대신 numpy 기반 음성 분석을 사용합니다.
  Python 3.12 이하에서는 librosa로 교체 가능하도록 `app/ai/voice_fit.py`가 독립 모듈로 분리되어 있습니다.
- MediaPipe 모델은 CDN에서 로드됩니다. 전시장 오프라인 대비 시 `.task` 파일을 로컬에 받아
  `frontend/src/features/roleplay/useNonverbal.ts`의 URL을 교체하세요.
