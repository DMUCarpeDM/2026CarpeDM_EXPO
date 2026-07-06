# 4-Fit 미러팅 (Mirror-Ting)

취업 준비생을 위한 AI 기반 직장생활 시뮬레이션 및 코칭 시스템.
2026 동양미래EXPO(제44회 졸업작품전시회) 출품작 — 동아리 CarpeDM (P.D.Lab).

사용자는 가상 회사 "㈜클라우드밋"에 입사한 신입이 되어, 고객사 장애가 발생하는
하루를 AI 상사·선배·동료와의 연속 역할극으로 체험한다. 시스템은 발화 내용·음성·
시선·자세를 분석해 4가지 지표(4-Fit)와 근거 기반 코칭 리포트를 제공한다.

| 지표 | 측정 항목 | 구현 |
|------|----------|------|
| Response-Fit | **로컬 임베딩 의미 매칭** — "고객께 사과드립니다"를 키워드 없이 뜻으로 인식(Ollama, 완전 폴백) · **문장 단위 인용 근거**(가장 좋았던/아쉬웠던 문장 자동 선택) · 체크리스트 커버리지 · 위험/권장 표현 · 격식 · 담화 구조(결론 선행·기한 약속·책임 문형·헤지·질문 정합성·**대안 없는 불가 통보**) | kiwipiepy + 로컬 임베딩 + 전문가 체크리스트 |
| Voice-Fit | **텍스트-음성 정렬(Vosk 단어 타임스탬프) — "어느 문장에서 성량이 무너졌는지" 문장 인용 코칭** · 간투어 밀도 · 문장 간 강조 대비 · 말속도(+추세) · 침묵 구조 · 성량 안정성 · 억양(F0) · 피치/성량 떨림(jitter/shimmer, 전용 짧은 창) · 주기성(HNR 근사) · 문말 억양 기울기 · **소음 강건 VAD(스펙트럼 평탄도)** | numpy DSP + Vosk (서버) — 합성 신호·골든 시나리오 검증 |
| Eye-Fit | **홍채 기반 시선 추정(머리 자세 보상 — 고개를 돌려도 눈이 카메라를 보면 정면)** · 듣기/말하기 응시 분리 · 응시 리듬(연속 응시 바우트) · 답변 개시 회피 관용 · 3×3 시선 존 분포 · 이탈 방향·최장 이탈·깜빡임 · 시선 미세 안정성·회복 시간 | MediaPipe Face Landmarker 478 랜드마크 (브라우저) |
| Posture-Fit | 어깨 기울기 · 고개 숙임 · 상체 흔들림 · 전/후반 붕괴 추세 · **무의식 습관(손-얼굴 터치·팔짱) · 앞/뒤 리닝 추세** | MediaPipe Pose Landmarker (브라우저) |
| **표정** (관찰) | 미소 비율 · **미소 타이밍**(압박 질문 교차 판정) · 입술 압축·찡그림(긴장 신호) | Face Landmarker blendshape |
| **심층 교차 분석** | **결정적 순간 감지** — 비언어 타임라인(2초 빈)×음성 스팬×턴 맥락을 시간 정렬해 "압박 질문 직후: 시선 이탈+긴장 표정 동시" 같은 복합 순간을 잡고 **그때 하던 말을 인용** · 압박 내성 프로파일(침착/회복/동요형) · 적응 곡선 · 말의 구조 종합 · **코호트 백분위**(표본 20+) · **신뢰도 라벨**(확실/참고/보류) · **재방문 성장 델타**("동요형→침착형") | 리포트 파이프라인 — 관찰·해석·처방 3단 코칭 |

## 아키텍처

```
 브라우저 (React + Vite)                     서버 (FastAPI)
┌──────────────────────────────┐   REST   ┌──────────────────────────────┐
│ 역할극 UI · Web Speech STT    │ ───────► │ 세션 FSM · 대화 엔진(템플릿/LLM) │
│ speechSynthesis TTS          │          │ 분석 파이프라인 (4-Fit 점수화)   │
│ MediaPipe 시선·자세 (온디바이스)│ ◄─────── │ 코칭 리포트 생성 (처방 템플릿)    │
│ WAV 인코딩 · 집계 지표만 전송   │          │ Vosk 서버 STT (오프라인 폴백)   │
└──────────────────────────────┘          └───────────┬──────────────────┘
                                                      │ SQLAlchemy
                                                      ▼
                                                   SQLite
```

설계 원칙:

- **외부 API 무의존** — STT/TTS는 브라우저 내장, 대화는 템플릿 엔진(선택적으로
  로컬 LLM), 영상 분석은 온디바이스. API 키와 사용료가 없다.
- **개인정보 최소화** — 영상 원본은 서버로 전송하지 않고 브라우저에서 계산한
  집계 지표만 전송. 익명 체험 코드로 개인 식별 정보 없이 학습 추이를 제공.
- **시연 안정성** — 모든 외부 의존에 폴백 계층: LLM→템플릿, Web Speech→Vosk,
  CDN→로컬 자산.

## 실행

### 백엔드 (Python 3.12+, FastAPI)

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn app.main:app --reload --port 8000
```

첫 기동 시 SQLite 스키마 생성과 시나리오 시드가 자동 실행된다.
API 문서: <http://localhost:8000/docs>

### 프론트엔드 (Node 20+, React + Vite)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

음성 인식(Web Speech API)은 Chrome 계열에서 동작한다. 마이크·카메라 권한을
거부해도 텍스트 입력으로 전체 흐름을 체험할 수 있다.

### 테스트

```bash
cd backend && ./.venv/bin/python -m pytest tests   # 대화 엔진·점수화·FSM·콘텐츠 규격
cd frontend && npx tsc -b && npm run build          # 타입 검사 + 프로덕션 빌드
```

## 전시 운영 가이드

### 오프라인 준비 (인터넷이 되는 곳에서 각 1회)

```bash
cd frontend && npm run setup-offline                          # MediaPipe wasm/모델
cd backend && ./.venv/bin/python scripts/setup_offline_stt.py # Vosk 한국어 STT 모델(82MB)
```

이후 시선·자세 분석과 음성 인식이 인터넷 없이 동작한다.
서버 STT 감지 여부는 `GET /api/health`의 `server_stt` 필드로 확인한다.

### 키오스크 모드

`/kiosk` 진입 시 대기 화면이 표시되고 전시 모드가 켜진다. 리포트 화면을 90초
방치하면 대기 화면으로 자동 복귀한다. 운영 대시보드(`/admin`)에서 지표 확인,
CSV 내보내기, 1클릭 초기화를 제공한다.

### 체험 코드

리포트에서 4자리 익명 코드가 발급된다. 재방문 시 시작 화면에서 코드를 입력하면
개인정보 없이 최근 10회 점수 추이가 이어진다.

### 로컬 LLM (선택)

[Ollama](https://ollama.com) 설치 후 아래처럼 실행하면 후속·압박 질문이 사용자
답변을 반영해 개인화된다. 타임아웃·형식 오류 시 템플릿 질문으로 자동 폴백한다.

```bash
ollama pull exaone3.5:2.4b
MIRROTING_DIALOGUE_PROVIDER=ollama ./.venv/bin/uvicorn app.main:app --port 8000
```

### 리허설용 데모 데이터

```bash
cd backend
./.venv/bin/python -m app.seed.demo_data           # 가상 세션 생성 (demo-* 키로 격리)
./.venv/bin/python -m app.seed.demo_data --clean   # 제거
```

시연·리허설 전용이다. 성과 지표 발표에는 실사용 데이터(CSV)를 사용한다.

## 저장소 구조

```
docs/prd.json          기획서 원본 (요구사항 9 · 기능 31 · 스펙 78)
backend/
  app/core/            설정 · DB · JWT
  app/models/          도메인 모델 (세션 FSM: ready→in_progress→analyzing→completed)
  app/seed/            시나리오 세계관 · 에피소드 · 체크리스트 · 금지어 사전
  app/services/        대화 엔진(dialogue/) · 분석 오케스트레이션 · 리포트 생성
  app/ai/              4-Fit 분석 모듈 · 점수 정규화 · STT 제공자
  app/api/             REST 라우터 (auth · scenarios · sessions · reports · admin · codes)
  tests/               pytest 32건
frontend/
  src/components/      Icon · Avatar (공용)
  src/features/        onboarding · roleplay · report · kiosk · admin · auth
  src/lib/             stt · tts · recorder(WAV 인코딩)
  scripts/             오프라인 자산 준비
```

시드 콘텐츠의 체크리스트는 실무 화법 프레임워크(PREP 결론 우선 보고, 4단계 사과
대응, DESC 거절 화법)에 정렬되어 있으며, 각 코멘트는 "관측 → 해석 → 처방(따라
말할 수 있는 예시 문장)" 구조를 따른다. 코드 주석의 `S-XXXXXX`/`F-XXXXXX`/`R-XXXXXX`는
`docs/prd.json`의 스펙·기능·요구사항 ID를 가리킨다.

## 참고 사항

- Python 3.14 환경에서는 librosa(llvmlite 미지원) 대신 numpy 기반 음성 분석을
  사용한다. `app/ai/voice_fit.py`가 독립 모듈이므로 3.12 이하에서는 교체 가능하다.
- Voice-Fit은 오디오가 있으면 실측, 음성 인식 턴은 발화 시간 근사, 텍스트 입력
  턴은 측정 제외로 처리해 지표 오염을 막는다.

## 라이선스

MIT — [LICENSE](LICENSE) 참조.
