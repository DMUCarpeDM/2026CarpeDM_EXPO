# 10/6 핵심 흐름 수정과 운영 인계

로컬 브랜치 `codex/expo-core-readiness`, 기준 main `07f172d82012fda7d039bbd447bc4ffece2bc6d9`에서 작업했다. IDPrinter 기준은 변경하지 않은 main `57678bf670056322c370a8d6d83e2f1ba8e6db3e`다. 기존 IDPrinter PR5, 원본 환경, 운영 DB, 원격 저장소는 변경하지 않았다.

## 적용한 동작

- 서비스 선택으로 돌아가는 수동 전환·결과 화면 idle 전환·브라우저 뒤로 가기의 서비스 선택 전환에서 세션, 턴, 결과, 기록, 동의, NFC, 진행률, 음성 참조, 장치 스트림을 함께 정리한다. `client_key`도 새 방문자에게 분리한다. 이전 방문자의 세션 생성·응답·완료·리포트·NFC 응답이 늦게 도착해도 새 화면을 채우지 않는다. 같은 방문자의 재연습과 동의한 로컬 보관 기록은 유지한다. 홈 이동 자체는 같은 방문자의 이동이므로 **방문자 교체는 서비스 선택으로 복귀**해야 한다.
- IDPrinter 카드 확인은 UID와 kiosk 방문 회차를 스냅샷으로 보존한다. 카드 팀 6개를 체험 직무로 임의 변환하지 않는다. 사용자가 체험 역할을 고른다. 최신 직장대화는 `workplace-conversation`을 사용한다.
- 서버가 최근 미러 태그와 현재 카드 회차를 재확인한 뒤 미러 세션을 저장하고 연결한다. 연결 실패는 `pending`, 카드 재사용은 `conflict`다. UI 재시도는 인증된 `POST /api/sessions/{id}/kiosk-link`로 **같은 미러 세션과 원래 스냅샷**을 사용한다. 새 세션을 생성하지 않는다.
- 양쪽 bridge 설정이 비어 있으면 기존 단독 NFC 흐름이다. 한쪽만 있으면 연결 오류다. 기존 DB는 `python -m app.seed.run`의 기존 컬럼 이관을 사용하며, UID 스냅샷은 기존 보관 기한 후 파기한다.

## 설치와 설정

검증 환경은 Intel macOS/CPython 3.12.13이다. 음성 의존성을 작업공간에 따로 설치해 기존 가상환경을 보존했다. 아래 제약 파일은 검증한 오디오 호환 조합이며 **전체 배포 lockfile은 아니다**. 실제 운영 OS의 새 가상환경에서도 검사해야 한다.

```sh
cd poc/backend
python3.12 -m venv .venv-expo
.venv-expo/bin/python -m pip install -r requirements.txt -c constraints-audio-py312.txt
.venv-expo/bin/python -m pip check
```

새로운 설치에만 `.env.example`을 `.env`로 복사하고, 기존 운영 파일은 보존한다. MirrorTing 서버 설정:

```dotenv
MIRROR_TING_IDPRINTER_BASE_URL=http://127.0.0.1:8002
MIRROR_TING_IDPRINTER_BRIDGE_TOKEN=<IDPrinter와 동일한 32자 이상 임의 토큰>
```

IDPrinter 서버 설정:

```dotenv
KIOSK_MIRRORTING_URL=http://127.0.0.1:8001
KIOSK_BRIDGE_TOKEN=<MirrorTing과 동일한 토큰>
```

같은 장비에서만 위 loopback 주소를 쓴다. PC↔Pi 구성에서는 상대 장비의 실제 주소와 접근 제어를 설정한다. 토큰은 서버에만 저장하며 VITE 변수·브라우저·로그로 보내지 않는다. 키를 설정하거나 실제 AI를 호출하는 작업은 이번 변경에 포함되지 않았다.

```sh
# 기존 운영 DB는 서버 정지 후 안전하게 백업하고, 새 릴리스 환경에서 이관한다.
.venv-expo/bin/python -m app.seed.run
.venv-expo/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
# 별도 터미널: mvp에서
npm ci
npm run build
npm run dev -- --host 127.0.0.1
```

두 서버의 시작은 권한·모델·장치 준비를 따로 요구한다. 단순 `/health.ok`는 네 영역의 실측 성공을 뜻하지 않는다. 발급 카드의 NFC 리더와 미러 리더 소유권을 분리하고, 미러 홈이 열린 뒤 실제 태그한다. 초기 폴링은 지난 태그를 소비하고 새 태그부터 처리한다.

## 회귀검사

```sh
# poc/backend에서: 유료 키와 리더를 비활성화한 자동검사
MIRROR_TING_OPENAI_API_KEY= MIRROR_TING_GEMINI_API_KEY= MIRROR_TING_ELEVENLABS_API_KEY= \
MIRROR_TING_NFC_BRIDGE_ENABLED=false HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
.venv-expo/bin/python -m pytest -q
# mvp에서: Chrome이 설치되어 있어야 한다. 동시 실행 수를 제한한다.
node --test --test-force-exit --test-concurrency=2 src/lib/*.test.js
```

`tests/test_idprinter_integration.py`는 `IDPRINTER_SOURCE=/absolute/path/to/CarpeDM_EXPO_IDPrinter`와 해당 서버의 Python 의존성을 준비한 경우만 실행한다. 실제 두 FastAPI 앱과 DB·인증·정규화를 사용하고 transport, NFC 읽기, 캐릭터 결과와 출력은 모의 처리한다. 완료 전 pending, 연결 장애와 재시도, 인증 거부, 무키 대체 대화→결과, 중복 화면 출력, 재발급 후 이전 결과 차단을 검사한다. 얼굴 모델과 실물 출력의 성공을 입증하지 않는다.

새 자동검사 목록은 `visitorIsolation.browser.test.js`, `kioskBridge.browser.test.js`, `test_idprinter_bridge.py`, `test_idprinter_kiosk_flow.py`, 선택형 두 앱 검사다. 실제 번들 Silero ONNX 로딩은 `test_voice_measurement.py`에 추가했다. 음성 보정의 모의 segmentation 검사만으로 torchaudio 누락을 놓치지 않도록 한다.

## 장비 도착 후 통과해야 할 항목

1. 운영 PC 새 환경에서 전체 회귀검사와 모델 로딩. Pi의 YuNet/SFace·프로토타입, MediaPipe 로컬 wasm/모델, Whisper, 실제 E5 가중치 준비 여부를 별도로 기록한다.
2. 카드 A 발급→미러 태그→역할 선택→동의→대화→리포트→퇴근 조회→실물 종이 확인. 익명 회차와 시각으로 기록하며 토큰은 기록하지 않는다.
3. 서비스 선택 복귀 후 방문자 B가 결과·기록을 열어 A의 내용이 없는지 확인한다. A의 분석이 진행 중인 때에도 같은 검사를 수행한다. 카메라·마이크 스트림 종료도 확인한다.
4. 연결을 끊었다 복구한 뒤 pending을 같은 세션으로 재시도한다. 카드 재발급을 끼워 넣으면 conflict여야 한다. 이전 방문자의 조회·출력을 허용하면 실패다.
5. 실제 NFC 중복·빠른 연속 태그, 프린터 전원/USB/용지 장애, 커터, Pi 재부팅, 긴 한글 리포트와 operation ID 복구를 검사한다. 마지막 두 항목은 별도 PR5 검증 범위다.

Voice는 현재 측정값 정책이며 점수는 null이다. Expression 공통 판단의 결과 연결은 이번 범위에 추가하지 않았다. 무키 통합검사의 총점과 네 점수는 모두 null을 보존한다. 이 변경은 네 영역 실측, 사용자 향상, 현장 출력 신뢰도나 대상 수상 가능성을 입증하지 않는다.
