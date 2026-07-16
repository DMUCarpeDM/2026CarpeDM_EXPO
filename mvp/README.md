# Mirrorting MVP — 전시 프론트엔드

이 디렉터리는 관람객 체험을 위한 MVP 프론트엔드입니다. AI 분석은 별도로 중복 구현하지 않고 [`../poc/backend`](../poc/backend)의 로컬 API를 사용합니다.

## 전시 흐름

1. 홈에서 연습을 시작합니다.
2. 기본 설정에서 상대 역할과 난이도를 고릅니다.
3. 상황 선택에서 역할별 업무 상황을 고릅니다.
4. 목표 선택에서 해당 상황에 맞는 대화 목표를 고릅니다.
5. 준비 확인 화면에서 선택 내용과 AI 상대 정보를 확인한 뒤 연습합니다.
6. 브라우저의 카메라·마이크 입력과 발화를 PoC API로 보내고, 4-Fit 분석 결과를 결과 화면에 표시합니다.

상대 역할·상황·목표는 MVP가 전시 흐름을 위해 관리하는 선택 데이터입니다. 백엔드 세션에는 난이도, 모드, `scenario_slug`, 동의 여부와 발화·비언어 지표가 전달됩니다.

## 실행

### 1. PoC 분석 서버

새 터미널에서 아래 명령을 실행합니다. Python 3.12를 권장합니다.

```bash
cd ../poc/backend
bash scripts/setup_ai.sh
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
```

`setup_ai.sh`는 로컬 STT와 Ollama 사용을 위한 환경을 준비합니다. 모델이 준비되지 않아도 PoC의 폴백 경로로 화면 흐름을 확인할 수 있습니다.

### 2. MVP 프론트엔드

다른 터미널에서 실행합니다. Node.js 20 이상을 권장합니다.

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 열고 카메라와 마이크 권한을 허용하세요. Vite는 `/api` 요청을 `http://127.0.0.1:8001`의 PoC 서버로 프록시합니다. (8000은 carpedm-kiosk가 사용하므로 8001을 씁니다. 다른 포트가 필요하면 `MIRRORTING_API_TARGET` 환경변수로 프록시 대상을 바꿀 수 있습니다.)

### 실시간 얼굴·자세 추적 (MediaPipe)

연습 화면의 얼굴 메시·자세 오버레이는 MediaPipe Tasks Vision(FaceLandmarker + PoseLandmarker)으로 실제 추적됩니다. WASM 런타임과 모델(약 42MB)은 git에 넣지 않으므로 최초 1회 아래 명령으로 `public/mediapipe/`에 준비하세요(오프라인 전시 PC는 미리 실행해 두면 인터넷 없이 동작).

```bash
npm install
bash scripts/fetch-mediapipe.sh
```

같은 추적 파이프라인이 시각 오버레이와 **실측 비언어 지표(Eye-Fit·Posture-Fit: 정면 응시율·시선 이탈·자세 흔들림 등)를 함께 산출**해 답변 제출 시 PoC 백엔드로 보냅니다(집계 정의는 `src/lib/nonverbal.js`, 백엔드 밴드와 일치). 모델 로드에 실패하거나 카메라가 없으면 정적 오버레이 + 측정 제외로 자동 폴백합니다. 최종 4-Fit 점수 산출은 기존대로 PoC 백엔드가 담당합니다.

## 확인

```bash
npm test
npm run build
```

전시 중에는 `poc/frontend`를 함께 실행하지 마세요. 두 프론트엔드가 기본적으로 같은 5173 포트를 사용합니다.
