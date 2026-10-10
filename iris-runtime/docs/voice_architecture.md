# Voice Architecture

> Updated-at: 2026-08-25

## 구성

- `iris/audio/`
  - UI 클라이언트, 녹음, 워커, Silero VAD, AEC, alert speech, 텍스트 정리
- `iris/runtime/`
  - `UserTurnDispatcher`, voice intents (연속 발화·barge-in·wake word)
- `services/voice_runtime/`
  - localhost 전용 FastAPI 런타임 (`127.0.0.1:18765`)
- `iris/storage/voice_prefs.py`
  - SQLite `user_preferences` 키 `voice_prefs_v1`
- `scripts/`
  - `.venv-voice` 설치, manifest/export 유틸

## 런타임 경계

- GUI 스레드: 버튼/상태/재생 제어만
- 별도 프로세스 (`.venv-voice`): STT/TTS 모델 로딩 및 추론
- 워커 스레드 (`QThread`): HTTP 호출과 UI 비동기 연결
- 앱 종료: `VoiceRuntimeProcessManager.shutdown()` → `POST /shutdown`
- 포트: **18765** 고정 (구 8765는 Control Surface와 충돌 → prefs 마이그레이션)

## API

- `GET /health`
- `POST /v1/audio/transcriptions`
- `POST /v1/audio/speech` — `voice_prompt_hash`를 비우면 보이스 프로필 + 톤 자동 선택
- `POST /v1/voice/prepare`
- `POST /v1/voice/analyze`
- `GET /v1/voice/references`
- `POST /v1/voice/reference`
- `GET /v1/voice/profile` — 커밋된 보이스 프로필 정보
- `POST /v1/voice/tone` — 문장이 어떤 톤으로 분류되는지 확인용
- `POST /v1/voice/cache/clear`
- `POST /shutdown`

## STT 흐름

1. 마이크 버튼 → `AudioRecorder` (+ Silero VAD / AEC, 레벨 → waveform)
2. 세그먼트 확정 → wav → `STTTranscriptionWorker` (큐)
3. runtime `/v1/audio/transcriptions`
4. 결과 → `UserTurnDispatcher` / `_submit_voice_turn` 으로 **채팅 턴 제출**
5. GPU면 float16, 실패/비가용이면 CPU int8
6. 연속 모드·barge-in·wake word는 prefs / `iris/runtime` 정책 따름

## TTS 흐름

1. 최종 답변 완료 + `tts_mode=auto` 또는 답변별 🔊
2. `normalize_tts_text` + `split_tts_sentences`
3. **프로필 경로**(`tts_use_voice_profile=true`, 기본): 준비 단계 없음.
   빈 `voice_prompt_hash`로 호출하면 런타임이 문장을 톤으로 분류하고
   저장된 x-vector/ref_code로 프롬프트를 만든다.
   **수동 경로**: reference 존재 확인 → `/v1/voice/prepare` (hash 캐시)
4. 세그먼트별 `/v1/audio/speech` → `QSoundEffect` 순차 재생
5. 새 재생 시작 시 기존 큐/재생 정리

### 보이스 프로필 경로

- 프로필: `iris/assets/voice/iris_voice_profile.{npz,json}` (커밋됨)
- 빌드: `scripts/build_voice_profile.py` — 녹음 폴더에서 임베딩 추출/집계
- 톤 분류: `services/voice_runtime/tone_router.py`
- 저장된 `x_vector`/`ref_code`로 `VoiceClonePromptItem`을 직접 만들기 때문에
  **녹음 원본이 없어도 동작한다.** `create_voice_clone_prompt`는 오디오에서 이 두 값을
  뽑을 뿐이고, 생성 경로는 값만 있으면 된다.
- 톤별로 `voice_prompt_hash`가 다르다(`profile:<이름>:<톤>`) → 생성 캐시가 섞이지 않는다.

### qwen-tts 호출 규약 (실측으로 확정, 바꾸지 말 것)

- `language="korean"` — **소문자**. 문자열이 프로세서 프롬프트에 그대로 들어가므로
  `"Korean"`으로 주면 발음이 깨진다.
- 수동 기준 음성 경로는 `x_vector_only_mode=True` — 사용자가 손으로 적은 `ref_text`는
  기준 음성과 어긋나기 쉬워서 ICL이 불안정하다.
- 프로필 경로는 전사문이 녹음과 함께 저장돼 있어 **ICL을 쓴다**. 이때
  `generate_voice_clone`에 `x_vector_only_mode`를 따로 넘기면 안 된다 —
  프롬프트 아이템이 이미 모드를 들고 있고, 덮어쓰면 `ref_code`가 무시된다.
- ICL은 `ref_code` 프레임이 생성 컨텍스트 앞에 붙으므로 RTF가 8배 → 11~13배로 늘어난다.
- 모델 로딩은 **bf16** (`dtype=torch.bfloat16`). fp16은 CUDA device-side assert로 죽는다.
- 클로닝은 `*-Base` 모델 전용 (`tts_model_type == "base"`).
- `generate_voice_clone`은 파일 경로가 아니라 `(파형 리스트, sample_rate)`를 반환한다.
  런타임이 직접 16bit PCM wav로 저장한다.
- 위 규약은 `tests/test_tts_service_contract.py`가 고정한다. mock 모드는 실제 모델을
  호출하지 않으므로 시그니처 오류를 잡아주지 못한다.

## 녹음 폴더 분석

- 재귀 검색: `.wav .mp3 .m4a .flac .ogg .aac`
- 원본 수정 금지
- 디코딩은 `services/voice_runtime/audio_io.py` (PyAV). libsndfile이 못 여는 m4a도
  길이/RMS/클리핑 지표가 나온다. PyAV가 없으면 soundfile → mutagen 순으로 폴백.
- quality_score + (가능 시) 참고용 전사
- 추천은 단일 파일 top 5 (합치기 없음). 여러 파일 합치기는 보이스 프로필 쪽에서 한다.

## mock / 실제

- 환경변수 `VOICE_RUNTIME_MOCK` (기본 1)
- 설정창 mock 체크박스가 프로세스 기동 시 반영
- 실제 모드에서 모델 미설치면 명확한 오류 (가짜 성공 없음)

## 현재 구현 메모

- 기본은 mock-friendly → CI에서 대형 모델 다운로드 금지
- `setup_voice_runtime.ps1 -Full` 로 torch/qwen-tts 추가 설치
