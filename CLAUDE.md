# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**4-Fit 미러팅(Mirror-Ting)** — 취업 준비생용 AI 직장생활 시뮬레이션·코칭 시스템. 2026 동양미래EXPO 졸업작품전시회 출품작(동아리 CarpeDM). 사용자는 가상 회사 "㈜클라우드밋" 신입이 되어 AI 상사·선배·동료와 연속 역할극을 하고, 시스템이 발화·음성·표정·자세를 분석해 4-Fit 지표와 근거 기반 코칭 리포트를 낸다(시선은 관찰 신호).

**작업 언어는 한국어다.** 코드 주석·문서·커밋 메시지·시드 콘텐츠가 전부 한국어이며, 신규 코드도 이를 따른다.

## 저장소 구조 (먼저 읽을 것)

리포지터리 루트에 코드가 없다. 세 갈래로 나뉜다.

- **`poc/backend/`** — FastAPI 분석 서버. **모든 AI·분석·저장 로직이 여기 하나뿐이다.** mvp도 이 서버를 쓴다.
- **`poc/frontend/`** — 초기 TS 프론트엔드(React 19 + zustand + react-router). 기능은 완비돼 있으나 전시에는 mvp를 쓴다. **레거시로 취급하되 CI가 검증하므로 깨뜨리지 말 것.**
- **`mvp/`** — 전시 관람객용 프론트엔드(JSX, framer-motion). **전시 당일 실제로 띄우는 화면.** `src/lib/pocApi.js`로 poc 백엔드를 호출하며 분석은 절대 중복 구현하지 않는다.
- **`poc/docs/`** — 기술 문서(prd.json·demo-checklist·architecture 등). 루트 `docs/`는 기획·부스 운영 문서(`plan/`, hardware-order-55.md)로 별개다.

**스펙 ID가 가리키는 파일은 `poc/docs/prd.json`이다.** mvp는 **5173**, poc/frontend(B2B 웹앱)는 **5174 고정**(vite 프록시 → 8001)이라 동시에 띄울 수 있다. 두 프론트 모두 백엔드를 **8001**로 기대한다(8000은 carpedm-kiosk가 점유).

## 개발 명령

### 백엔드 (Python 3.12 권장, FastAPI)

```bash
cd poc/backend
bash scripts/setup_ai.sh    # 권장: Python 3.12 venv + AI 스택 전체(Whisper·Vosk·Ollama) 원커맨드
./.venv/bin/uvicorn app.main:app --reload --port 8001
```

`setup_ai.sh` 없이 최소 실행: `python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt` (STT·LLM은 폴백 모드). 첫 기동 시 SQLite 스키마 생성 + 시나리오 시드 자동 실행. AI 구성 상태는 `GET /api/health`로 확인(`{"server_stt": "whisper", "dialogue_provider": "ollama"}`). API 문서는 `/docs`.

### 프론트엔드 (Node 20+ / CI는 22, React 19 + Vite)

```bash
cd mvp            # 전시용 — 이쪽이 기본
npm install
npm run dev       # http://localhost:5173 (/api → 127.0.0.1:8001 프록시)
npm test          # node --test src/lib/*.test.js
npm run build

cd poc/frontend   # 레거시 — 수정 시에만
npm install
npm run lint      # oxlint
npm run build     # tsc -b && vite build
npx tsc -b        # 타입검사만
```

백엔드 없이 mvp 화면만 보려면 `?demo=practice` · `?demo=result` · `?demo=compare` 쿼리를 쓴다.

### 테스트

```bash
cd poc/backend
./.venv/bin/python -m pytest tests                    # 전체 (2026-07-31 기준 460 passed — Ollama 미가동 시 일부 skip)
./.venv/bin/python -m pytest tests/test_scoring.py                    # 파일 하나
./.venv/bin/python -m pytest tests/test_scoring.py::test_weighted_mean # 테스트 하나
./.venv/bin/python -m pytest -k voice                                 # 이름 필터
```

`poc/backend/tests/`에 45개 파일. `tests/golden/`의 JSON 케이스(`response_cases.json`, `session_cases.json`)로 회귀를 고정하는 골든 하네스가 있다. CI(`.github/workflows/ci.yml`)는 **세 잡**을 돌린다: poc/backend(Python 3.12 `pytest`), poc/frontend(Node 22 `tsc -b` + `npm test` + `build`), mvp(Node 22 `npm test` + `build`). **린트(oxlint)는 CI에 없으므로 로컬에서 돌린다.**

### 오프라인 자산 / 데모 데이터

```bash
cd mvp        && npm run setup-offline   # MediaPipe wasm·모델 (poc에 있으면 복사, 없으면 다운로드)
cd poc/backend && bash scripts/setup_ai.sh # Whisper(small)·Vosk·Ollama 모델 캐시

cd poc/backend
./.venv/bin/python -m app.seed.demo_data           # 가상 세션 생성 (demo-* 키로 격리)
./.venv/bin/python -m app.seed.demo_data --clean   # 제거
```

## 아키텍처

브라우저와 서버의 역할 분리가 이 프로젝트의 큰 그림이다.

**브라우저(React + Vite):** 역할극 UI, Web Speech STT, speechSynthesis TTS, MediaPipe 표정·시선·자세 온디바이스 계산, WAV 인코딩. **영상 원본은 서버로 보내지 않고 집계된 지표만 REST로 전송한다.**

**서버(FastAPI):** 세션 FSM, 대화 엔진(템플릿/LLM), 4-Fit 분석 파이프라인·점수화, 코칭 리포트 생성, 서버 STT(faster-whisper → Vosk 폴백). SQLAlchemy → SQLite.

흐름: 프론트가 턴마다 답변(텍스트/음성)과 비언어 집계 지표를 보내고, 세션 종료 시 백엔드가 4-Fit을 점수화해 리포트를 만든다.

**세션 FSM**(`app/models/models.py`의 `SessionStatus`): `ready → in_progress → analyzing → completed`, 중단 시 `aborted`.

**4-Fit 분석**(`app/ai/`): Response-Fit(의미 매칭·담화 구조), Voice-Fit(음성 DSP·텍스트-음성 정렬), Expression-Fit·Posture-Fit(브라우저 MediaPipe blendshape·자세 지표를 서버가 점수화 — 표정은 α 검증 전 `provisional` 참고 지표), + 시선(점수 축이 아닌 관찰 신호 — 실시간 넛지·gaze_map), + 심층 교차 분석(`app/services/deep_analysis.py`, `moments.py` — 비언어·음성·턴 맥락을 시간 정렬한 "결정적 순간" 감지). 모든 원시 지표는 `app/ai/scoring.py`의 `band_score`로 0~100 정규화 후 가중 평균한다.

**대화 엔진**(`app/services/dialogue/`): `template_provider`(항상 동작) 또는 `ollama_provider`(로컬 LLM 개인화). `MIRROR_TING_DIALOGUE_PROVIDER`로 선택하며 타임아웃·형식 오류 시 템플릿으로 폴백한다.

디렉터리 책임:

- `poc/backend/app/core/` 설정·DB·JWT · `app/models/`·`app/schemas/` 도메인 모델·pydantic 스키마 · `app/seed/` 시나리오 세계관·에피소드·체크리스트·금지어 + **시나리오 팩**(`packs/*.json` — 파일 하나가 직무 시나리오 하나: 페르소나·리액션 풀·루브릭 가중치·감정 프로파일·결말, 로더는 `packs.py`)·브랜드 응대 매뉴얼(`manuals/`) · `app/services/` 대화 엔진·감정 상태 머신(`dialogue/emotion.py`)·분석 오케스트레이션·리포트·FSM·점수 표기 방침(`score_policy.py`)·NFC 브리지(`nfc_bridge.py`) · `app/ai/` 4-Fit 모듈·점수 정규화·STT 제공자·LLM judge(`judge.py`)·파라링귀스틱(`paralinguistics.py`)·매뉴얼 검색(`manual_rag.py`) · `app/api/` REST 라우터(전부 `/api` prefix: auth·scenarios·sessions·reports·admin·codes·orgs·nfc)
- `mvp/src/pages/` 전시 흐름 화면(Home·setup/·Preview·Practice·Result·Compare·Feedback·Share) · `src/lib/` pocApi(백엔드 계약)·audioWav·useFaceTracking·reportFits·exhibitionSession · `src/components/` report·setup·navigation·ui · `src/data/` 역할·상황·목표 선택 카탈로그(전시 전용, 백엔드엔 difficulty/mode/`scenario_slug`만 전달)
- `poc/frontend/src/features/` (레거시) 화면 단위(onboarding·roleplay·report·kiosk·admin·auth) · `src/lib/` stt·tts·recorder(WAV 인코딩)·mirror mode · `src/stores/` zustand · `src/api/` axios client

## 핵심 설계 원칙 (코드 전반을 관통)

1. **외부 API 무의존** — STT/TTS는 브라우저 내장, 대화는 템플릿(선택적 로컬 LLM), 영상은 온디바이스. API 키·사용료가 없다. 신규 기능도 이 제약을 지킨다.
2. **폴백 계층** — 외부 의존에는 폴백을 둔다: LLM→템플릿, Web Speech→서버 Whisper/Vosk→직접 입력. 시연 안정성이 최우선이므로 폴백을 깨뜨리지 않는다. **방향에 주의** — 자산 폴백은 로컬→CDN이지 그 반대가 아니다. MediaPipe wasm·모델은 로컬에 있으면 로컬, 없으면 CDN으로 내려간다(`mvp/src/lib/visionAssets.js`) → `npm run setup-offline`을 돌리지 않으면 오프라인에서 카메라 분석이 뜨지 않는다. 한글 폰트(Pretendard)는 CDN 전용이고 로컬 사본이 없다 — 실패 시 시스템 한글 폰트로 렌더된다(렌더 비차단이라 화면은 멈추지 않는다).
3. **개인정보 최소화** — 영상 원본 미전송, 집계 지표만 전송. 4자리 익명 체험 코드로 개인정보 없이 추이를 잇는다. 음성 파일은 저장 동의(`S-CBYKOH`) 시에만 `media_retention_days`(기본 7일) 보관하고 미저장 동의는 분석 직후 삭제한다.

## 코드 규약 (비자명한 것)

- **스펙 ID 추적** — 코드 주석의 `S-XXXXXX`(스펙) / `F-XXXXXX`(기능) / `R-XXXXXX`(요구사항)는 `poc/docs/prd.json`의 ID를 가리킨다. 새 기능은 관련 ID를 주석에 남긴다.
- **설정** — pydantic-settings, env 접두사 `MIRROR_TING_`, `.env` 파일. 모든 기본값은 `app/core/config.py`에 있다(예: `MIRROR_TING_DIALOGUE_PROVIDER=ollama`, `MIRROR_TING_STT_WHISPER_MODEL=small`). `STT_WHISPER_MODEL`은 크기 이름 또는 로컬 디렉터리 경로 — 상대 경로는 backend 루트 기준으로도 해석된다(`app/ai/stt/base.py`).
- **Python 버전** — 3.12가 기준. 3.14도 동작하지만 faster-whisper(ctranslate2 휠 부재)가 빠져 서버 STT는 Vosk 폴백만 쓴다. 그래서 `app/ai/voice_fit.py`는 librosa/llvmlite 대신 numpy 기반 독립 모듈로 작성돼 있다.
- **Voice-Fit 측정 정책** — 오디오가 있으면 실측, 음성인식 턴은 발화시간 근사, 텍스트입력 턴은 측정 제외(지표 오염 방지). 이 구분을 무너뜨리지 않는다.
- **코칭 코멘트 구조** — 모든 코멘트는 "관측 → 해석 → 처방(따라 말할 예시 문장)"을 따른다. 시드 체크리스트는 실무 화법 프레임워크(PREP 결론 우선 보고, 4단계 사과, DESC 거절)에 정렬돼 있다.
- **TypeScript(poc/frontend 한정)** — `verbatimModuleSyntax`가 켜져 있어 타입 임포트는 반드시 `import type`. `noUnusedLocals`/`noUnusedParameters` 엄격. React 19, react-router-dom 7, 상태는 zustand. **mvp는 TS가 아니라 순수 JSX이고 라우터 없이 자체 화면 전환을 쓴다** — 두 프론트엔드의 규약을 섞지 않는다.
- **.editorconfig** — Python 4-space, TS/JS/CSS/JSON/YAML 2-space, LF 개행, 끝 공백 제거(단 `.md` 제외), 파일 끝 개행.
- **Ollama 주의** — EXAONE 3.5는 q8_0 KV 캐시와 비호환(head_dim=80). `setup_ai.sh`가 `OLLAMA_KV_CACHE_TYPE=f16`을 강제한 LaunchAgent(`com.mirroting.ollama`)로 Ollama를 기동한다. `brew services start ollama`로 직접 띄우면 500 오류가 난다.

## 전시 운영

두 프론트엔드가 전시 모드를 다르게 구현한다.

- **mvp(실제 전시 화면)** — 라우터가 없으므로 경로가 아니라 상태로 동작한다. 홈에서 45초 무조작 시 `AttractLoop`가 가치 제안 슬라이드를 순환하고(`?attract=<초>`로 조정), 리포트 흐름은 90초 방치 시 복귀한다(`exhibitionSession.js`의 `REPORT_FLOW_IDLE_TIMEOUT_MS`, `?idle=<초>`로 조정하고 **`?idle=0`이면 복귀를 끈다** — 시연 영상 촬영처럼 리포트 화면을 오래 띄워야 할 때. 이 복귀는 세션까지 지우므로 촬영 중에는 반드시 꺼야 한다). 운영 대시보드는 없다.
- **poc/frontend(레거시)** — `/kiosk` 키오스크 모드, `/admin` 운영 대시보드(지표 확인·CSV 내보내기·1클릭 초기화). 백엔드의 admin·auth 라우터를 쓰는 유일한 화면이다.

리포트에서 4자리 익명 코드가 발급되고 재방문 시 최근 10회 점수 추이가 이어진다(`/api/codes`, `/api/reports/history`). 상세는 `poc/docs/`(demo-checklist.md, mirror-ux-plan.md, hardware-plan.md, pitch/), 부스 기획은 루트 `docs/plan/` 참고.

**B2B 온보딩 확장 (2026-07-31)** — 기관(초대 코드)·NFC 카드(ACR122U, 발급 키오스크 `?kiosk=issue` → 미러 태그 즉시 시작)·영수증 QR 클레임·감정 상태 머신(카페 온도 팩)·judge 3겹이 얹혀 있다. 결정 기록은 `docs/plan/b2b/`(PRD·ADR·동의 문구), 스펙 ID는 `S-B2B-*`. 수강생 화면 점수는 등급 표기(`score_policy.py`), 전시 mvp는 점수 유지.

**전시 전 필수 보정** — `poc/docs/demo-checklist.md`가 기준이다. 특히 의미 매칭 임계값은 개발 맥 기준이라 전시 PC에서 `scripts/calibrate_semantic.py`로 반드시 재보정하고, 떨림 임계값(`MIRROR_TING_TREMOR_*_FLOOR`) 기본값은 합성 신호 보정치라 실제 육성 검증이 필요하다.

**Windows 전시 PC** — 실제 전시는 Windows PC에서 돌아간다. 매일 기동은 루트 `start-exhibition.ps1`(Ollama→백엔드 8001→mvp 5173), 셋업 차이는 루트 `WINDOWS-SETUP.md` 참조(ctranslate2==4.4.0 고정, 테스트 시 `PYTHONUTF8=1` 필요).
