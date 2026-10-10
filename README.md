# Mirror-Ting — AI 직장 대화 연습

Mirror-Ting은 업무 대화를 역할극으로 연습하고 응답·목소리·표정·자세의 4-Fit 결과를 확인하는 전시용 프로젝트입니다. 간투어는 보조 관찰 항목이며 시선 측정은 사용하지 않습니다.

처음 참여했다면 [새 팀원 시작 안내](docs/developer-onboarding.md)를 먼저 읽으세요. 설치부터 첫 체험 확인까지 순서대로 정리했습니다.

## 다른 컴퓨터에서 스마트 미러 보여주기

### 공통 준비

Git과 Node.js/npm이 설치된 컴퓨터에서 저장소를 받습니다. 이미 받은 저장소라면 로컬 변경을 보관하고 `git pull`로 업데이트하세요.

```bash
git clone https://github.com/DMUCarpeDM/2026CarpeDM_EXPO.git
cd 2026CarpeDM_EXPO/mvp
npm ci
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

서버 터미널을 열어 둔 채 Chrome에서 아래 주소를 여세요. `npm ci`는 처음 실행하거나 업데이트 후 다시 실행합니다. 생략하면 `shaders/react` 같은 새 패키지의 import 오류가 생길 수 있습니다. 설치에는 인터넷이 필요합니다. 포트가 사용 중이면 기존 서버를 확인하거나 다른 포트로 실행하고 아래 주소의 `5175`도 같은 값으로 바꾸세요.

### 모드 1 — 카드 없이 미러 화면 바로 보기

백엔드·NFC·카메라·마이크 없이 화면을 보여주는 모드입니다. **실제 AI 대화, 답변 입력, 분석·결과 저장은 실행하지 않습니다.**

| 화면 | 주소 |
| --- | --- |
| 출근 대화 화면 바로 보기 | [출근 미러](http://127.0.0.1:5175/src/features/smart-mirror/previews/simulation/4k.html?scene=morning) |
| 업무 대화 화면 바로 보기 | [업무 미러](http://127.0.0.1:5175/src/features/smart-mirror/previews/simulation/4k.html?scene=work) |
| 퇴근 대화 화면 바로 보기 | [퇴근 미러](http://127.0.0.1:5175/src/features/smart-mirror/previews/simulation/4k.html?scene=leaving) |
| 출근 → 업무 → 퇴근 자동 안내 | [자동 안내](http://127.0.0.1:5175/src/features/smart-mirror/previews/flow/4k.html) |

대화 화면은 시나리오의 예시 대사와 상대 영상을 표시합니다. 자동 안내는 33초 뒤 대화 미리보기로 넘어가며 숨긴 탭에서는 진행 시간이 멈춥니다. 운영체제의 동작 줄이기 설정에서도 안내 시간은 유지하고 이미지 이동만 줄입니다.

4K 주소는 2160×3840 세로 화면을 현재 창에 맞춰 축소합니다. 가로 모니터에서는 양옆 검은 여백이 정상입니다. 더 크게 확인하려면 `/previews/flow/index.html` 또는 `/previews/simulation/scene.html?scene=morning`을 사용하세요. 이 미리보기는 Vite 개발 서버에서 여는 경로이며 `npm run build`의 기본 결과물에는 포함되지 않습니다.

### 모드 2 — 키오스크 안내·동의 화면에서 시작하기

프론트 서버를 켠 뒤 다음 주소를 엽니다.

**[직장 대화 키오스크 안내·카드 발급](http://127.0.0.1:5175/?service=workplace&kiosk=issue)**

이 주소는 직장 대화 선택 → 분석·개인정보 처리 동의 → 카드 태그·발급 → 완료 안내 순서로 진행합니다. 첫 안내·동의 화면은 프론트만으로 볼 수 있지만 **실제 카드 발급과 대화에는 백엔드, NFC 리더·카드, API·모델 설정이 필요합니다.** 카드가 없는 화면 미리보기와 실제 연동 체험을 구분해서 시연하세요.

실제 체험까지 진행하려면 Python 3.12 환경을 준비하고 [백엔드 설치 안내](docs/developer-onboarding.md#처음-설치하기)에 따라 의존성·API 키·모델을 설정합니다. 기존 `.env`는 덮어쓰지 않습니다. 키·DB·모델은 Git에서 내려받지 않으므로 다른 컴퓨터에서도 별도로 준비해야 합니다.

macOS/Linux — 저장소 루트에서 별도 터미널:

```bash
cd poc/backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
# 최초 설정 시에만 실행하고 .env에 필요한 설정을 입력합니다.
cp -n .env.example .env
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Windows PowerShell — 저장소 루트에서 별도 터미널:

```powershell
cd poc/backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# .env에 필요한 설정을 입력한 다음 서버를 실행합니다.
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

프론트의 기본 API 대상은 `127.0.0.1:8001`입니다. 백엔드를 다른 포트로 실행했다면 프론트를 재시작할 때 연결 주소를 맞춥니다.

```bash
# macOS/Linux 예시
MIRROR_TING_API_TARGET=http://127.0.0.1:8003 npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

```powershell
# Windows PowerShell 예시
$env:MIRROR_TING_API_TARGET="http://127.0.0.1:8003"
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

발급한 카드는 **[실제 스마트 미러 진입](http://127.0.0.1:5175/?service=workplace&mirror=1)** 화면에서 태그합니다. 이 주소는 카드 없는 미리보기 주소가 아닙니다. 동의된 카드와 준비된 장치를 사용해 안내 → 대화 → 분석 결과로 진행합니다. `/api/health`의 `degraded`·`degraded_reasons`도 확인하고, 미가동 분석을 측정된 결과처럼 설명하지 마세요.

여기서 `127.0.0.1`은 브라우저를 여는 컴퓨터 자신입니다. 다른 컴퓨터에서는 그 컴퓨터에 저장소와 서버를 준비한 뒤 같은 주소로 접속하세요. 현재 컴퓨터의 로컬 주소만 복사해서 원격 컴퓨터에서 접속할 수는 없습니다.

## 현재 구성

| 경로 | 담당 기능 |
| --- | --- |
| [mvp/](mvp/README.md) | 관람객용 React/Vite 화면, 카메라·마이크, 실시간 받아쓰기 |
| [poc/backend/](poc/README.md) | FastAPI, 세션·녹음 저장, 대화 생성, 분석·리포트 |
| [poc/frontend/](poc/frontend/README.md) | 별도 웹앱. 전시 화면 작업은 우선 `mvp/`에서 시작합니다. |
| [docs/](docs/README.md) | 현재 운영·모델 계약과 제품 기획 자료. 구현 상태는 코드와 테스트로 확인합니다. |

## 음성 처리 방식

2026-09-12 기준으로 실시간 받아쓰기는 Chrome STT, 녹음 후 간투어 분석은 Whisper `small`과 간투어 프롬프트를 사용합니다. Vosk와 서버 실시간 전사 API는 제거했습니다.

- Chrome이 만든 답변은 대화 생성과 응답 분석에 사용합니다. 인식에 실패하면 직접 입력으로 전환합니다.
- Whisper는 업로드한 녹음을 다시 전사합니다. 여기서 간투어를 집계하며 Chrome 답변 원문은 바꾸지 않습니다.
- 간투어는 누락·오인식 가능성이 있는 추정치입니다. 점수에 반영하지 않으며, 분석할 수 없으면 0회로 표시하지 않습니다.
- 디지털 무음은 Whisper 전사 전에 제외합니다. 이 처리가 모든 잡음이나 환각을 막는 것은 아닙니다.

역할극 대화는 `MIRROR_TING_DIALOGUE_PROVIDER`로 OpenAI·Gemini·Ollama 중 선택합니다. 답변의 목표 달성·모순 근거는 Gemini로 판단합니다. 여성 캐릭터는 준비된 Iris TTS를 사용하고, 남성 캐릭터·Iris 미준비·합성 실패 시 브라우저 TTS로 전환합니다. AI 발화 중 Chrome 음성 인식은 일시 중지합니다. Chrome STT와 외부 API를 사용하는 체험에는 인터넷이 필요합니다.

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

## 유지보수

- [현재 영상 구성](docs/service-media.md)
- [Iris TTS 설정](docs/smart-mirror-tts-integration-2026-10-10.md)
- [프로젝트 정리 기록](docs/maintenance/cleanup-2026-10-11.md)
