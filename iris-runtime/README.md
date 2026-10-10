# 스마트 미러 Iris TTS 런타임

출처·고정 커밋·로컬 변경은 SOURCE.json, 원본 라이선스는 LICENSE / LICENSE.md에 있다.
GTX 1060용으로 CUDA에서 bf16 미지원 시 float32/SDPA를 선택하고 WAV 합성은 한 번에 하나씩 수행한다.

프로젝트 루트에서 `./scripts/setup-iris-gtx1060.ps1`로 Windows 전용 환경을 최초 1회 설치한다.
원본의 CUDA 12.8용 `scripts/setup_voice_runtime.ps1 -Full`은 GTX 1060에서 사용하지 않는다.
이후 기존 backend 실행으로 전용 환경의 서버를 자동 시작한다. backend 종료 시 자신이 실행한 Iris만 종료한다.
이미 따로 실행한 Iris 서버는 그대로 사용한다. `MIRROR_TING_IRIS_AUTOSTART=false`면 자동 실행을 끈다.
로그: `.logs/runtime.log`. 시작 직후 서버가 준비되기 전에는 브라우저 음성으로 진행한다.

모델 `Qwen/Qwen3-TTS-12Hz-0.6B-Base`는 첫 실제 합성 시 사용자 Hugging Face 캐시로 내려받는다.
가상환경·캐시·가중치는 Git에 포함하지 않는다. 원본 녹음은 필요 없으며 JSON/NPZ 프로필은 포함했다.
수동 서버 실행: `./scripts/start-iris.ps1`.
실제 합성/백엔드 검사: `py -3.12 ./scripts/test-iris.py --backend http://127.0.0.1:8001`.

실제 1060에서 모델 로딩·메모리·합성 시간·스피커는 별도 실측해야 한다.
