# Mirrorting MVP — 전시 프론트엔드

이 디렉터리는 관람객 체험용 React/Vite 프론트엔드입니다. 실제 대화와 분석은 [`../poc/backend`](../poc/backend)의 로컬 API를 사용합니다.

## 체험 흐름

1. 홈에서 연습을 시작합니다.
2. **상대 역할 선택**에서 동료·상사·임원·외부 파트너 중 한 명을 고릅니다.
3. **시나리오 선택**에서 해당 역할의 업무 장면을 고릅니다.
4. **난이도 선택**에서 기본·압박·초압박 모드를 고릅니다.
5. 준비 확인 화면에서 선택한 내용을 확인한 뒤 연습합니다.
6. AI 상대의 질문 영상과 대화하고, 4-Fit 분석 결과를 확인합니다.

AI 질문은 PoC 서버의 Ollama가 선택한 장면을 기준으로 만듭니다. 질문이 표시되는 동안 상대의 `speaking` 영상이 재생되고, 대화 로그에는 현재 AI 질문만 표시됩니다.

## 실행

### 1. PoC 분석 서버

Python 3.12와 Ollama를 준비한 뒤 다른 터미널에서 실행합니다.

```bash
cd ../poc/backend
bash scripts/setup_ai.sh  # 최초 1회: Ollama, STT 모델 준비
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
```

`exaone3.5:2.4b`는 실제 시뮬레이션의 필수 대화 모델입니다. 서버가 `http://127.0.0.1:8001/api/health`에서 `ollama.dialogue: true`를 반환하는지 확인하세요.

### 2. MVP 프론트엔드

```bash
npm install
npm run setup-offline  # 최초 1회: MediaPipe wasm/모델 준비
npm run dev
```

`http://localhost:5173`을 열고 카메라와 마이크 권한을 허용합니다. 브라우저 STT를 지원하지 않으면 입력창에 직접 작성해 **전송**할 수 있습니다.

## 권한과 모델

- 카메라: 브라우저 안에서 MediaPipe 얼굴·자세 분석에 사용합니다.
- 마이크: 브라우저 STT와 음성 분석용 녹음에 사용합니다.
- `bge-m3`, faster-whisper `small`, Vosk 한국어 모델은 분석 품질·오프라인 폴백을 위한 권장 구성입니다.
- 별도 외부 API 키는 사용하지 않습니다. Ollama는 로컬 `localhost:11434`에서 실행합니다.

## 확인

```bash
npm test
npm run build
```

백엔드 없이 레이아웃만 볼 때는 `http://localhost:5173/?demo=practice`·`?demo=result`·`?demo=compare`를 사용합니다. 이 모드에서는 실제 AI 대화와 분석이 실행되지 않습니다.
