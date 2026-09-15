# 새 팀원 시작 안내

이 문서는 2026-09-12 코드 기준입니다. 관람객용 화면은 `mvp/`, 분석 서버는 `poc/backend/`에서 작업합니다. 아래 설치 명령은 macOS 터미널과 저장소 루트를 기준으로 작성했습니다.

## 처음 설치하기

Node.js 20 이상, Python 3.12, Git과 Chrome을 준비합니다. Python 3.14에서도 현재 환경의 Whisper 실행을 확인했지만 새 팀원은 Python 3.12로 환경을 맞추는 편이 좋습니다. 카메라·마이크와 인터넷 연결도 필요합니다.

```bash
git clone https://github.com/DMUCarpeDM/2026CarpeDM_EXPO.git
cd 2026CarpeDM_EXPO
```

### 백엔드 준비

```bash
cd poc/backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

처음 설치할 때만 `.env.example`을 `.env`로 복사합니다. 기존 `.env`에는 개인 설정과 키가 있으므로 덮어쓰지 마세요.

```bash
cp .env.example .env
```

`.env`에서 아래 항목을 확인합니다. 키 값은 담당자에게 별도로 받아 입력합니다.

| 설정 | 입력할 값·용도 |
| --- | --- |
| `MIRROR_TING_DIALOGUE_PROVIDER` | `openai`. 현재 코드는 `ollama`·`template`를 대화 제공자로 받지 않습니다. |
| `MIRROR_TING_OPENAI_API_KEY` | GPT-4o 대화 생성에 필요한 키 |
| `MIRROR_TING_OPENAI_MODEL` | 기본값 `gpt-4o` |
| `MIRROR_TING_ELEVENLABS_API_KEY` | 상대 음성용 키. 미설정 시 브라우저 TTS 사용 |
| `MIRROR_TING_ELEVENLABS_VOICE_ID` | ElevenLabs에서 사용할 음성 |
| `MIRROR_TING_STT_WHISPER_MODEL` | 기본값 `./whisper-models/small` |
| `MIRROR_TING_STT_FILLER_PROMPT` | 필요할 때만 변경. 기본 간투어 프롬프트는 `app/core/config.py`에 있습니다. |

Whisper 모델을 다운로드합니다. 이 명령은 모델 파일만 준비하며, 실제 대화에는 계속 인터넷과 OpenAI 키가 필요합니다.

```bash
.venv/bin/python scripts/setup_offline_stt.py
```

응답 의미 매칭까지 확인하려면 모델 담당자에게 E5 가중치를 받아 `models/response_e5_v1/final/`에 둡니다. 모델이 없으면 키워드 판정으로 동작하므로 이를 완전한 의미 분석 결과로 해석하지 마세요.

서버를 실행하고 이 터미널을 열어 둡니다.

```bash
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

### 프론트 준비

새 터미널에서 저장소 루트로 이동한 뒤 실행합니다.

```bash
cd mvp
npm ci
npm run setup-offline
npm run dev
```

Chrome에서 `http://localhost:5173`을 엽니다. 브라우저와 macOS의 개인정보 보호 설정에서 카메라·마이크를 허용하세요. `setup-offline`은 MediaPipe 자산을 로컬에 준비하는 명령입니다.

`start-dev-mac.sh`, `start-exhibition.ps1`, `backend/scripts/setup_ai.sh`에는 이전 환경의 설정이 남아 있을 수 있습니다. 새 환경을 맞출 때는 이 문서의 개별 실행 명령을 사용하세요. 특히 기존 Python 환경을 교체하거나 Ollama를 설치하는 작업을 먼저 실행할 필요는 없습니다.

## 첫 체험에서 확인할 것

1. `http://127.0.0.1:8001/api/health`를 열고 `dialogue_provider: "openai"`, `dialogue_ready: true`, `server_stt: "whisper"`를 확인합니다. `ok: true`만으로 모든 분석 모델이 준비됐다고 판단하지 마세요.
2. 홈에서 연습에 들어가 마이크로 말합니다. Chrome 받아쓰기 결과가 입력창에 표시되는지 확인합니다.
3. 답변을 제출하고 다음 질문을 확인합니다. 브라우저 개발자 도구에서 답변 `/response`와 녹음 `/audio` 요청이 성공하는지 봅니다.
4. 체험을 종료해 결과를 확인합니다. Whisper는 저장된 녹음으로 간투어를 분석하며 Chrome 답변을 덮어쓰지 않습니다.
5. ‘어’, ‘음’을 포함해 말한 녹음과 결과를 직접 비교합니다. 누락뿐 아니라 말하지 않은 간투어가 추가됐는지도 확인하세요.

최종 분석은 진행 중인 녹음 업로드 완료를 기다립니다. 업로드 제한은 30초이며, 실패하거나 오디오가 없으면 해당 간투어는 미측정으로 남습니다. 결과의 `null`을 0회로 바꾸면 안 됩니다. 간투어는 추정치이며 점수에 반영하지 않습니다.

## 음성 데이터가 이동하는 순서

```text
마이크
  ├─ Chrome STT → 답변 텍스트 → 역할극 대화·응답 분석
  └─ 턴 녹음 → WAV 업로드 → 체험 종료 후 Whisper + 간투어 프롬프트
                               └─ 간투어 집계 → 결과 리포트
```

Chrome 음성 인식은 외부 서비스에 음성이 전송될 수 있습니다. Whisper는 서버 PC에서 처리합니다. 목소리 크기·속도·침묵 등의 분석은 기존 음성 분석 모듈이 담당하며 Chrome STT 자체가 계산하는 값은 아닙니다.

## 자주 막히는 부분

| 증상 | 확인할 곳 |
| --- | --- |
| 화면은 열리지만 API 요청 실패 | Vite 기본 대상은 8001입니다. 백엔드 포트와 맞추고 프론트를 다시 실행하세요. |
| `dialogue_provider` 설정 오류 | `.env`의 값을 `openai`로 수정하세요. |
| `dialogue_ready: false` | OpenAI 키와 백엔드 설정을 확인하세요. 키를 로그나 채팅에 붙여 넣지 마세요. |
| `server_stt: null` | Python 환경의 `faster-whisper` 설치, 모델 경로, 서버 로그를 확인한 뒤 재시작하세요. |
| health에 ‘오프라인 음성 인식 폴백 불가’ 표시 | 이전 표현이 남아 있습니다. 현재는 Whisper 간투어 분석 불가를 의미합니다. Chrome 대체 전사는 제공하지 않습니다. |
| Chrome 받아쓰기 실패 | 인터넷·마이크 권한·입력 장치를 확인하세요. 직접 입력은 가능하며 Whisper 실시간 전사로 전환하지 않습니다. |
| 간투어 수치가 표시되지 않음 | 녹음 업로드 성공 여부와 Whisper 로그를 확인하세요. 무음·전사 없음·분석 실패는 0회와 다릅니다. |
| `semantic_match: false` | E5 모델 경로를 확인하세요. 없으면 키워드 판정만 사용합니다. |
| 브라우저 테스트가 Chrome을 찾지 못함 | Chrome 설치 여부를 확인하세요. 현재 일부 테스트는 `channel: "chrome"`을 사용합니다. |

포트를 바꾸는 경우 `mvp/`에서 다음처럼 실행합니다.

```bash
MIRROR_TING_API_TARGET=http://127.0.0.1:8000 npm run dev
```

## 작업 위치와 검증

화면·녹음 작업은 [프론트 README](../mvp/README.md), 분석·DB 작업은 [백엔드 README](../poc/README.md)의 파일 표를 참고하세요. 환경 변수 이름과 기본값은 `poc/backend/app/core/config.py`를 기준으로 확인합니다.

```bash
# 저장소 루트 기준
cd mvp
npm test
npm run build

cd ../poc/backend
.venv/bin/python -m pytest -q
```

코드 검증과 음성 인식 품질 검증은 다릅니다. 테스트가 통과해도 사람 목소리·주변 소음이 바뀌면 간투어 인식 결과가 달라질 수 있습니다. 실제 녹음 확인을 별도로 진행하세요.

## 데이터와 협업

현재 기본 DB는 SQLite이며 `poc/backend/mirror-ting.db`에 저장합니다. 시리얼 번호 로그인과 Supabase 전환은 별도 계획으로, 이 설치만으로 완성되는 기능이 아닙니다. DB 모델 변경 시 기존 데이터의 이관 방법부터 확인하세요. 운영 DB를 삭제해 스키마를 맞추면 안 됩니다.

`.env`, DB, 녹음, 모델 가중치, 가상환경과 `node_modules`는 커밋하지 않습니다. 기획서나 과거 실험의 성능 수치는 현재 모델의 보장값으로 옮겨 적지 마세요.

새 작업은 최신 `main`에서 브랜치를 만듭니다. 기존 변경이 있으면 먼저 내용을 확인하고, 자신의 작업 파일만 커밋합니다. 다른 사람의 변경을 지우거나 강제 푸시로 맞추지 마세요.

```bash
git status --short
git fetch origin
git switch -c your-task origin/main
```

임시 STT 비교 서버 `stt-lab`은 삭제했습니다. 제품용 Whisper 모델은 `poc/backend/whisper-models/`에 별도로 있으므로 테스트 폴더 정리와 구분하세요.
