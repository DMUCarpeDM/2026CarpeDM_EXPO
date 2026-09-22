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

역할극 대화는 기본적으로 서버의 GPT-4o가 생성하며, `MIRROR_TING_DIALOGUE_PROVIDER=gemini`로 Gemini를 선택할 수 있습니다. 답변 근거·모순 분석은 여전히 OpenAI 키가 필요합니다. Gemini 키만 설정하면 대화는 생성할 수 있지만 해당 분석은 미측정입니다. ElevenLabs 설정이 없거나 재생에 실패하면 브라우저 TTS를 사용합니다. Chrome STT와 외부 API를 사용하는 체험에는 인터넷이 필요합니다.

## 직장 대화 연속 체험

- 직장대화 모드는 직무·난이도 선택 없이 상황 미리보기에서 시작합니다.
- 출근 → 업무 → 퇴근의 3단계를 이어갑니다. 5분 설정은 12턴, 10분 설정은 20턴이며 실제 소요 시간은 답변 길이에 따라 달라집니다.
- Gemini를 선택하면 하루 계획 생성을 시도합니다. OpenAI 모드 또는 계획 생성 실패 시에는 준비된 시나리오로 계획을 구성합니다. 대화 생성 실패 시 같은 장면의 대사·상대 반응으로 이어갑니다.
- 감정별 영상은 대사 키워드와 평가 신호로 선택하는 연출입니다. 별도의 감정 인식 모델 결과가 아니며, 네 캐릭터가 현재 동일한 영상 세트를 공유합니다.
- `/api/health`의 `dialogue_fallback`은 직장 연속 대화의 생성·대체 횟수를 보여줍니다. 이 통계는 서버 재시작 시 초기화되며 대화 품질 점수가 아닙니다.

변경 범위와 검증 방법은 [직장 대화 통합 안내](docs/workplace-integration.md)를 참고하세요.

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
