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
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`setup_ai.sh`는 로컬 STT와 Ollama 사용을 위한 환경을 준비합니다. 모델이 준비되지 않아도 PoC의 폴백 경로로 화면 흐름을 확인할 수 있습니다.

### 2. MVP 프론트엔드

다른 터미널에서 실행합니다. Node.js 20 이상을 권장합니다.

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 열고 카메라와 마이크 권한을 허용하세요. Vite는 `/api` 요청을 `http://127.0.0.1:8000`의 PoC 서버로 프록시합니다.

## 확인

```bash
npm test
npm run build
```

전시 중에는 `poc/frontend`를 함께 실행하지 마세요. 두 프론트엔드가 기본적으로 같은 5173 포트를 사용합니다.
