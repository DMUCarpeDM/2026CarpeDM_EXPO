# 스마트 미러 TTS 선택 반영

2026-10-10 기준. STT 작업에서 추가한 검증 문서는 삭제했고, STT 소스는 변경하지 않았다.

## 원격 변경

출처: [2354c06 — 직장 대사를 Gemma 4로 두고 여자 TTS는 아이리스 목소리를 쓴다](https://github.com/kwakminoo/2026CarpeDM_EXPO/commit/2354c06901e1004a18fcdf4badaba0f83bdec54b).
확인한 원격 main 최신 커밋은 `9a88b9dbfa98cf2e77e8982b1f5aacb65dd395f7`이다.

대화 모델·Day Plan·시험 기록은 병합하지 않고 TTS 화자 선택만 반영했다. 현재 프로젝트의 Iris 경로 제한·오류 처리와 스마트 미러 레이아웃은 유지했다.

## 동작

- 직장대화 캐릭터의 `voice_gender`를 추가했다: 박선임 female, 이팀장·최동료 male.
- `/api/health`는 `tts_female=iris|browser`, `tts_male=browser`를 제공한다.
- 여성 캐릭터이며 Iris가 준비됐을 때만 `/api/tts`에 `{text, voice: "female"}`를 요청한다.
- 남성 캐릭터 또는 Iris 미준비 상태는 Chrome의 한국어 브라우저 음성을 사용한다. 브라우저 음성의 실제 성별은 설치된 음성에 따라 달라질 수 있다.
- Iris 요청 실패도 브라우저 음성으로 전환하며, 이 스마트 미러 경로에서 ElevenLabs를 호출하지 않는다. 기존 다른 클라이언트의 voice 없는 요청에 대한 API 호환 코드는 유지했다.

## Iris 런타임이란

문장을 실제 음성 WAV로 만드는 별도 프로그램이다. 이 저장소에는 그 프로그램을 HTTP로 호출하는 코드만 있고, 프로그램 자체·음성 모델·목소리 프로필은 없다.

기존 설정 계약:

```dotenv
MIRROR_TING_IRIS_VOICE_BASE_URL=http://127.0.0.1:18765
MIRROR_TING_IRIS_VOICE_TIMEOUT_SEC=20
# 기본: 실행 사용자의 ~/.iris-light/audio
# MIRROR_TING_IRIS_AUDIO_DIR=C:/path/to/shared/audio
```

런타임이 제공해야 하는 API:

- `GET /health`: 실제 준비 상태일 때 `{ "status": "ok", "mock_mode": false }`.
- `POST /v1/audio/speech`: `{ "text": "문장", "voice_prompt_hash": "" }`를 받아 `{ "audio_path": "생성한 WAV 경로" }`를 반환.
- WAV는 backend가 읽을 수 있는 동일 PC의 `iris_audio_dir` 아래에 있어야 한다. 다른 PC 런타임의 로컬 경로를 반환하는 구성은 현재 파일 읽기 방식과 호환되지 않는다.

사용자가 제공한 [Project-IRIS-Light](https://github.com/kwakminoo/Project-IRIS-Light)의 `062ae3931d83bf3dd56a43bcc7b82897dc01126c`에서 런타임과 JSON/NPZ 음성 프로필을 확인했다. 모델은 `Qwen/Qwen3-TTS-12Hz-0.6B-Base`이며 가중치는 대상 PC에서 내려받는다. 별도 녹음본·ElevenLabs 키는 필요 없다.

대상 GPU는 GTX 1060 6GB이다. 새 설치 ZIP에는 CUDA 12.6 PyTorch 2.8.0 설치 도구, bf16 미지원 시 float32/SDPA를 쓰는 Iris 서버 수정, 실제 합성·backend WAV 검사 도구를 포함했다. 원본의 CUDA 12.8 설치 스크립트는 사용하지 않는다. 기존 20초 제한 대신 초기 검증용 180초 설정을 안내했다. 실제 장치의 메모리·지연은 미검증이며 스트리밍 가속은 이번 WAV 연결에 적용하지 않았다.

로컬 검증 3개 통과: 원본 프로필 로딩 및 모델만 대체한 실제 Iris API→backend 어댑터 연결, mock 제외, Pascal float32/SDPA 모델 로딩 선택. 실제 Iris 모델 추론이나 Windows GPU 검증으로 간주하지 않는다.
운영 PC에서는 백엔드를 재시작하여 캐릭터 시드와 health 변경을 반영하고 Chrome을 새로고침한다. 한국어 브라우저 음성과 실제 스피커 출력을 확인한다. 이 작업은 로컬 소스 반영이며 별도 물리 스마트 미러 PC로 원격 배포한 것은 아니다. 기존 환경설정 ZIP에는 이번 소스 변경이 포함되지 않는다. 새 `smart-mirror-setup-iris-gtx1060-20261010.zip`에는 TTS 비교용 소스 스냅샷과 Iris 서버·설정 지침을 포함했다. 대상 Codex가 TTS만 선택 반영하며 파일 통째 덮어쓰기는 하지 않는다.

## 검증

- TTS/API 프론트 단위 테스트: 23 passed.
- 백엔드 TTS·시드·직장대화 테스트: 28 passed.
- 실제 Chrome 스마트 미러 화면에서 모의 서버로 검증: 여성 Iris 요청과 실패 시 브라우저 전환, 여성 Iris 미준비 시 브라우저, 남성 브라우저. `tts_ready=true`인 기존 ElevenLabs 상태가 있어도 이 경로를 사용하지 않음을 검사. 1개 통합 테스트 안의 3개 시나리오 통과.
- MVP 빌드 성공. 기존 큰 번들 경고는 유지.
- 실제 Iris 모델 합성·ReSpeaker·물리 스피커 출력은 대상 PC에서 추가 검증 필요.

## 프로젝트 직접 구현 (추가)

설정 ZIP과 별도로 프로젝트에 `iris-runtime/` 소스·프로필, `scripts/setup-iris-gtx1060.ps1`, 실행/실합성 검사 도구를 추가했다. 대용량 가상환경·모델은 Git에서 제외한다.

- backend lifespan에서 전용 Iris 환경을 자동 실행하고 종료한다. 기존 외부 실행 서버는 종료하지 않는다. 환경 미설치면 로그를 남기고 browser로 진행한다.
- 준비 상태는 실모드와 프로필 존재를 함께 검사한다. 이는 실제 모델 추론 성공을 보장하지는 않는다.
- 현재 TTS API는 voice 없는 이전 요청도 Iris WAV로 처리하며 ElevenLabs 분기를 사용하지 않는다. 남성은 browser로 전환한다.
- GTX 1060의 bf16 미지원 경로는 float32/SDPA. 동시 WAV 합성은 직렬 처리한다.
- 기본 Iris 제한 시간 180초. 턴 변경/일시정지는 브라우저의 진행 중 HTTP 요청을 중단한다. 이미 서버에서 시작한 모델 추론까지 중단하는 것은 아니며 결과는 캐시될 수 있다.
- STT·LLM·화면 레이아웃은 변경하지 않았다.
- 검증: backend 27 passed, frontend 24 passed. 원본 프로필과 실제 API 연결은 가짜 모델로 검증했다. Windows 설치/실제 GPU 합성은 이 macOS PC에서 미검증이다.

백엔드의 보통 실행 명령에 자동 실행이 연결되어 있다. Windows 대상 PC에서는 최초 의존성 설치 1회만 필요하다. 현재 PC의 키값·기존 `.env`는 변경하지 않았다.

## main 반영 전 검증

원격 DMUCarpeDM/2026CarpeDM_EXPO main `0ccb330`의 별도 작업 공간에 TTS 변경만 선택 적용했다. 로컬에 남아 있는 LLM·화면·STT의 다른 미커밋 변경은 포함하지 않았다. 최신 main에서 backend(TTS·런타임·시드) 32 passed, frontend(API·재생) 25 passed, 실제 Chrome의 모의 API 통합 테스트 1 passed(여성 Iris 실패→browser, 여성 미준비→browser, 남성→browser), 잠금 파일 기준 npm ci와 npm run build 성공. 기존 큰 번들 경고와 Starlette deprecation 경고는 유지된다. 실제 GTX 1060의 합성 속도·메모리·물리 스피커는 미검증이다.
