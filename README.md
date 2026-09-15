# Mirror-Ting — AI 직장 대화 연습

Mirror-Ting은 업무 대화를 역할극으로 연습하고 응답·목소리·표정·자세의 4-Fit 결과를 확인하는 전시용 프로젝트입니다. 시선과 간투어는 보조 관찰 항목입니다.

처음 참여했다면 [새 팀원 시작 안내](docs/developer-onboarding.md)를 먼저 읽으세요. 설치부터 첫 체험 확인까지 순서대로 정리했습니다.

## 현재 구성

| 경로 | 담당 기능 |
| --- | --- |
| [mvp/](mvp/README.md) | 관람객용 React/Vite 화면, 카메라·마이크, 실시간 받아쓰기 |
| [poc/backend/](poc/README.md) | FastAPI, 세션·녹음 저장, 대화 생성, 분석·리포트 |
| [poc/frontend/](poc/frontend/README.md) | 별도 웹앱. 전시 화면 작업은 우선 `mvp/`에서 시작합니다. |
| [docs/](docs/) | 기획·설계 자료. 과거 계획과 현재 구현이 다를 수 있습니다. |

## 음성 처리 방식

2026-09-12 기준으로 실시간 받아쓰기는 Chrome STT, 녹음 후 간투어 분석은 Whisper `small`과 간투어 프롬프트를 사용합니다. Vosk와 서버 실시간 전사 API는 제거했습니다.

- Chrome이 만든 답변은 대화 생성과 응답 분석에 사용합니다. 인식에 실패하면 직접 입력으로 전환합니다.
- Whisper는 업로드한 녹음을 다시 전사합니다. 여기서 간투어를 집계하며 Chrome 답변 원문은 바꾸지 않습니다.
- 간투어는 누락·오인식 가능성이 있는 추정치입니다. 점수에 반영하지 않으며, 분석할 수 없으면 0회로 표시하지 않습니다.
- 디지털 무음은 Whisper 전사 전에 제외합니다. 이 처리가 모든 잡음이나 환각을 막는 것은 아닙니다.

역할극 대화는 서버의 GPT-4o가 생성합니다. ElevenLabs 설정이 없거나 재생에 실패하면 브라우저 TTS를 사용합니다. Chrome STT와 외부 API를 사용하는 체험에는 인터넷이 필요합니다.

## 빠른 실행

Python 환경·API 키·모델을 처음 준비하는 경우 [설치 안내](docs/developer-onboarding.md#처음-설치하기)를 따르세요. 아래 명령은 준비가 끝난 환경에서 실행합니다.

첫 번째 터미널, 저장소 루트 기준:

```bash
cd poc/backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

두 번째 터미널, 저장소 루트 기준:

```bash
cd mvp
npm run dev
```

Chrome에서 `http://localhost:5173`을 열고 카메라·마이크 권한을 허용합니다. Vite의 `/api` 기본 연결 대상은 `http://127.0.0.1:8001`입니다. 백엔드를 8000으로 띄웠다면 프론트 실행 시 주소를 맞춥니다.

```bash
MIRROR_TING_API_TARGET=http://127.0.0.1:8000 npm run dev
```

## 실행 확인

`http://127.0.0.1:8001/api/health`에서 `dialogue_ready: true`와 `server_stt: "whisper"`를 확인합니다. 이는 준비 상태이며, 실제 녹음과 간투어 품질은 체험으로 확인해야 합니다.

```bash
# 저장소 루트에서 프론트 확인
cd mvp
npm test
npm run build

# 이어서 백엔드 확인
cd ../poc/backend
.venv/bin/python -m pytest -q
```

API 키·녹음·DB·모델 가중치는 Git에 올리지 않습니다. 현재 DB 기본값은 SQLite입니다. 시리얼 로그인·Supabase 전환 계획은 구현 완료 여부를 별도로 확인해야 합니다.
