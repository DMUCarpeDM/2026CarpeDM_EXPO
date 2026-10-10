# 스마트 미러 Iris TTS

현재 MVP는 여성 캐릭터에게 Iris 음성, 남성 캐릭터에게 브라우저 음성을 사용합니다. Iris 미준비·합성 실패 시 브라우저로 전환합니다. `/api/tts`에서는 ElevenLabs를 호출하지 않습니다.

## 구성

- `iris-runtime/`: Iris 서버 소스·목소리 JSON/NPZ 프로필·라이선스. 대용량 모델 가중치는 별도 설치합니다.
- `poc/backend/app/services/iris_runtime.py`: 백엔드 시작·종료와 전용 Iris 프로세스 수명 연결. 이미 외부에서 실행한 서버는 종료하지 않습니다.
- `poc/backend/app/services/iris_tts.py`: 준비 상태, WAV 요청, 허용 디렉터리와 반환 경로 검사.
- `mvp/src/lib/turnSpeechPlayback.js`: 재생·브라우저 전환·턴 변경 시 HTTP 요청 취소.
- `mvp/src/pages/PracticePage.jsx`: AI 발화 중 Chrome STT 일시 중지와 발화 종료 후 재개.

## Windows / GTX 1060 6GB 설치

저장소 루트에서 `scripts/setup-iris-gtx1060.ps1`을 실행합니다. CUDA 12.6 PyTorch를 사용하며 bf16 미지원 GPU는 float32/SDPA로 처리합니다. 실제 장치의 메모리·합성 지연·스피커 출력은 현장 검증이 필요합니다.

설정은 `poc/backend/.env.example`을 참고합니다. 기존 `.env`는 덮어쓰지 않습니다.

```dotenv
MIRROR_TING_IRIS_VOICE_BASE_URL=http://127.0.0.1:18765
MIRROR_TING_IRIS_VOICE_TIMEOUT_SEC=180
MIRROR_TING_IRIS_AUTOSTART=true
```

모델·가상환경·API 키는 Git에 포함하지 않습니다. 기본 생성 음성 경로는 실행 사용자의 `~/.iris-light/audio`이며, 변경 시 backend와 Iris에서 같은 디렉터리를 사용해야 합니다.

## 확인

- `/api/health`: `tts_female`, `tts_male`, `tts_ready` 확인. 준비 상태는 실제 합성 성공과 다릅니다.
- `scripts/test-iris.py`: 실제 WAV 생성 확인.
- 백엔드: `tests/test_iris_runtime.py`, `test_iris_runtime_contract.py`, `test_tts.py`.
- MVP: `src/lib/turnSpeechPlayback.test.js`, `mirrorTts.browser.test.js`, `usePracticeTranscription.test.js`.

합성은 직렬 처리합니다. 브라우저의 요청 취소는 이미 시작한 GPU 추론까지 중단하지 않으며, 결과는 서버에 캐시될 수 있습니다.
