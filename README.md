# Mirrorting — AI 직장 대화 연습

Mirrorting은 업무 대화를 역할극으로 연습하고, 응답·목소리·시선·자세의 4-Fit 분석으로 다음 연습을 안내하는 전시용 프로젝트입니다.

## 저장소 구성

| 경로 | 역할 |
| --- | --- |
| [`mvp/`](./mvp) | 관람객이 사용하는 전시 프론트엔드. 상대 역할 → 시나리오 → 난이도를 고르고 연습·결과를 보여줍니다. |
| [`poc/`](./poc) | FastAPI 기반의 로컬 분석 서버. 세션, Ollama 대화, STT·비언어 지표, 4-Fit 리포트를 담당합니다. |
| [`2026_EXPO_CarpeDM_작품개발계획서_최종.hwp`](./2026_EXPO_CarpeDM_작품개발계획서_최종.hwp) | 작품 개발 계획서입니다. |

## 이번 업데이트

- AI가 질문을 시작하는 즉시 준비된 `speaking` 영상을 재생하고, 질문이 끝나면 대기 영상으로 돌아갑니다.
- 연습 화면의 질문·입력 패널 투명도를 높여 상대 AI 영상을 더 잘 볼 수 있게 했습니다.
- 입력창 오른쪽에 **전송** 버튼을 추가했습니다. 말이 끝난 뒤 3초 동안 추가 발화가 없으면 자동 전송도 유지됩니다.
- 대화 로그는 기존 템플릿 반응 문구를 따로 보이지 않고, Ollama가 만든 현재 AI 질문만 보입니다.
- Ollama 프롬프트는 선택한 장면의 상황·확인 요소·기본 질문을 벗어나 새 인물·일정·업무를 만들지 않도록 제한합니다.

## 전시 실행

### 1. 필요한 환경

- macOS 기준: Python 3.12, Node.js 20 이상, Ollama
- 전시 PC의 카메라와 마이크
- 인터넷이 없는 환경까지 대비하려면 처음 한 번 모델을 내려받은 뒤 동일한 PC에서 실행합니다.

### 2. 로컬 AI 모델 준비 (최초 1회)

```bash
cd poc/backend
bash scripts/setup_ai.sh
```

스크립트가 준비하는 모델은 아래와 같습니다.

| 구성 | 모델/도구 | 용도 | 필수 여부 |
| --- | --- | --- | --- |
| 대화 AI | `exaone3.5:2.4b` (Ollama) | 상대 역할의 질문 생성 | **필수** |
| 의미 매칭 | `bge-m3` (Ollama) | 답변이 체크 항목을 얼마나 담았는지 보조 판단 | 권장 |
| 서버 STT | faster-whisper `small` | 업로드 음성을 한국어 텍스트로 변환 | 권장 |
| 오프라인 STT 폴백 | Vosk 한국어 모델 | Whisper를 쓸 수 없을 때의 보조 경로 | 권장 |
| 자세·얼굴 분석 | MediaPipe Face/Pose 모델 | 브라우저 안에서 시선·자세 지표 계산 | 권장 |

실제 시뮬레이션은 Ollama 연결이 확인돼야 시작됩니다. API 키는 필요하지 않습니다. Ollama를 직접 준비했다면 아래 명령도 사용할 수 있습니다.

```bash
ollama serve
ollama pull exaone3.5:2.4b
ollama pull bge-m3
```

### 3. 분석 서버 실행

첫 번째 터미널에서 실행합니다.

```bash
cd poc/backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
```

정상 여부는 `http://127.0.0.1:8001/api/health`에서 확인합니다. `ollama.dialogue`가 `true`여야 실제 연습을 시작할 수 있습니다.

### 4. MVP 프론트엔드 실행

두 번째 터미널에서 실행합니다.

```bash
cd mvp
npm install
npm run setup-offline  # 최초 1회: MediaPipe wasm/모델을 public/에 준비
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. Vite는 `/api` 요청을 `http://127.0.0.1:8001`의 PoC 서버로 전달합니다. 연습 화면만 정적으로 보려면 `?demo=practice`를 붙일 수 있지만, 이 모드에서는 실제 AI 대화와 분석이 실행되지 않습니다.

## 전시 PC 권한 설정

1. 브라우저의 `localhost:5173` 카메라·마이크 권한을 **허용**합니다.
2. macOS에서는 **시스템 설정 → 개인정보 보호 및 보안 → 카메라 / 마이크**에서 사용하는 브라우저를 허용합니다.
3. 브라우저 음성 인식(Web Speech API)은 브라우저별 지원 범위가 다릅니다. 사용할 수 없으면 입력창에 직접 작성하고 **전송**을 누르면 됩니다.
4. Ollama는 `http://localhost:11434`에서 실행되어야 합니다. 다른 PC나 외부 네트워크에 서버를 열 경우 `.env`의 `MIRRORTING_JWT_SECRET`, `MIRRORTING_ADMIN_TOKEN`, `MIRRORTING_REQUIRE_SECURE=true`를 반드시 설정합니다.

기본 전시는 로컬 PC에서 실행하므로 별도 외부 API 권한이나 API 키를 요구하지 않습니다.

## 점검 명령

```bash
cd mvp
npm test
npm run build

cd ../poc/backend
.venv/bin/pytest
```

PoC의 상세 API·설계 문서는 [`poc/README.md`](./poc/README.md)와 [`poc/docs/`](./poc/docs)에 있습니다.
