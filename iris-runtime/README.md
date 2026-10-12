# 스마트 미러 Iris TTS 런타임

출처·고정 커밋·로컬 변경은 SOURCE.json, 원본 라이선스는 LICENSE / LICENSE.md에 있다.
Windows GTX 1060에서는 FP32/SDPA와 CUDA Graph를 사용하고 WAV 합성은 한 번에 하나씩 수행한다.
`faster-qwen3-tts==0.3.2`가 설치되어 있으면 `cuda_graph_fp32` 경로를 자동 선택한다.
큰 텍스트 임베딩은 CPU에서 필요한 행만 읽어 GPU로 보내고, 이미 준비된 Iris 프로필에 필요 없는
speaker/codec encoder는 CPU에 둔다. 모델 가중치의 정밀도, 화자, 전체 ICL 참조와 읽는 문장은 유지한다.
로드·워밍업·합성은 한 CUDA 작업 스레드에서 실행한다. 요청 종료 후 사용하지 않는 메모리 캐시를 반환한다.
512 토큰 고정 캐시가 부족하거나 끝까지 생성되지 않은 경우 같은 모델의 일반 생성으로 재시도한다.
따라서 긴 문장은 더 오래 걸릴 수 있으며, 모든 문장에 대한 3초 보장은 없다.

프로젝트 루트에서 `./scripts/setup-iris-gtx1060.ps1`로 Windows 전용 환경을 최초 1회 설치한다.
원본의 CUDA 12.8용 `scripts/setup_voice_runtime.ps1 -Full`은 GTX 1060에서 사용하지 않는다.
이후 기존 backend 실행으로 전용 환경의 서버를 자동 시작한다. backend 종료 시 자신이 실행한 Iris만 종료한다.
이미 따로 실행한 Iris 서버는 그대로 사용한다. `MIRROR_TING_IRIS_AUTOSTART=false`면 자동 실행을 끈다.
로그: `.logs/runtime.log`. 시작 직후 서버가 준비되기 전에는 브라우저 음성으로 진행한다.

모델 `Qwen/Qwen3-TTS-12Hz-0.6B-Base`는 설치된 로컬 Hugging Face 캐시를 우선 사용한다.
캐시가 없다면 최초 로드 시 내려받는다. Windows CUDA와 설치된 Mac Metal은 서버 시작 시 짧은 문장을
실제 합성하여 예열한 뒤 API 요청을 받는다. `/health`의 `tts_backend`, `fast_model_warmed`로 확인한다.
가상환경·캐시·가중치는 Git에 포함하지 않는다. 원본 녹음은 필요 없으며 JSON/NPZ 프로필은 포함했다.
수동 서버 실행: `./scripts/start-iris.ps1`.
실제 합성/백엔드 검사: `py -3.12 ./scripts/test-iris.py --backend http://127.0.0.1:8001`.

실측할 때는 `/v1/audio/speech`의 `force_regenerate: true`로 WAV 캐시를 제외한다.
Gemini 응답 시간, TTS 전체 생성 시간, 음성 재생 길이를 구분하고 실제 전시 화면을 함께 실행한 상태로 측정한다.
짧은 문장의 단독 벤치마크 결과를 긴 답변 전체의 생성 시간으로 해석하지 않는다.

Mac: Python 3.12와 SoX(`brew install sox`) 설치 후 저장소 루트에서 `bash scripts/setup-iris-mac.sh`를 실행한다.
Apple Silicon Mac은 설치된 Metal 전용 런타임을 우선한다. 원본 Qwen 0.6B Base의 BF16 추론 모델과 float32 음성 디코더를 사용하며, 기존 Iris 화자 임베딩·ICL 참고 토큰·톤·샘플링 설정을 유지한다. 작은 모델·Q4/Q8 양자화·재생 속도 조절을 사용하지 않는다.
설치 스크립트는 `qwentts-cpp-python==0.5.0`과 모델 파일을 준비한다. 모델은 `models/metal/`에 저장하며 Git에서 제외한다. 요청 처리 중에는 다운로드하지 않는다. 최적화 런타임 미설치·로딩 실패 환경은 기존 PyTorch 경로를 사용한다.
Metal 변환 모델 출처는 `Serveurperso/Qwen3-TTS-GGUF`의 고정 리비전 `b7ee2e8c7459c3bea99da23e3d178125a7d1713c`다. 기존 Mac 환경은 `iris-runtime/.venv-voice/bin/python -m pip install qwentts-cpp-python==0.5.0`, `HF_HUB_DISABLE_XET=1 iris-runtime/.venv-voice/bin/python scripts/setup-iris-metal.py` 실행 후 Iris를 재시작한다.
`IRIS_TTS_BACKEND=pytorch` 환경값으로 기존 경로를 선택할 수 있다. 설치된 Metal 모델은 서버 시작 단계에서 짧은 문장으로 예열한다. 준비가 끝나야 API 요청을 받으므로 초기 로딩 시간을 사용자 첫 대사에서 제외한다. 설치 후 백엔드를 재시작하면 Iris도 자동 실행한다.
고정 첫 질문 15개 사전 생성: `iris-runtime/.venv-voice/bin/python scripts/prepare-iris-questions.py`.
실제 모드 Iris 서버가 실행 중이어야 한다. WAV는 `iris/assets/prepared-speech`에 저장되며,
백엔드는 같은 문장의 파일을 합성 요청보다 우선한다. 질문 변경 시 새 해시로 생성한다.
WAV를 함께 배포하면 다른 PC에서도 고정 질문은 재합성하지 않는다. 후속 질문은 런타임 설치가 필요하다.
끝말 누락·파일 끝 파형 검수: `poc/backend/.venv/bin/python scripts/audit-iris-questions.py --repair`.
로컬 Whisper small로 원문과 끝말을 대조하고, 의심 파일만 최대 3회 재합성한다.
통과한 후보만 교체한다. 결과는 `.omo/evidence/iris-question-audit.json`에 기록한다.
전사는 자동 선별용이므로 실제 발음·마무리는 청취로도 확인한다.
