# Windows 전시 PC 셋업 기록 (2026-07-27)

이 문서는 이 PC(i7-12700 · RAM 16GB · Windows 11 Pro)에 구성한 전시 환경과,
macOS 기준 문서(`README.md`, `poc/backend/scripts/setup_ai.sh`)와 달라진 점을 기록한다.

## 매일 시작하는 법

저장소 루트에서 `start-exhibition.ps1`을 실행한다 (더블클릭 또는 `pwsh -File start-exhibition.ps1`).
Ollama → 분석 서버(8001) → MVP(5173) 순서로 뜨고 브라우저가 열린다.

상태 확인: <http://127.0.0.1:8001/api/health>
기대값: `"server_stt":"whisper"` · `"ollama":{"dialogue":true,"embedding":true}` · `"degraded":false`

## 설치된 구성

| 구성 | 버전/위치 | 비고 |
| --- | --- | --- |
| Python | 3.12.10 (winget, 사용자 설치) | 3.13은 faster-whisper 설치 불가라 별도 설치 |
| Node.js | v24.18.0 (winget) | `C:\Program Files\nodejs` |
| Ollama | 0.32.4 | `%LOCALAPPDATA%\Programs\Ollama` |
| 백엔드 venv | `poc/backend/.venv` (Python 3.12) | requirements + faster-whisper |
| Whisper small | `poc/backend/models/whisper-small` | HF 캐시 대신 **로컬 디렉터리** (아래 참조) |
| Vosk 한국어 | `poc/backend/models/vosk-ko` | 오프라인 STT 폴백 |
| MediaPipe | `mvp/public/mediapipe-wasm`, `mvp/public/models` | `npm run setup-offline` 완료 |

## macOS 문서와 다른 점 (중요)

1. **ctranslate2는 4.4.0으로 고정.** 4.8.1은 이 PC에서 Whisper 모델 로드 시
   액세스 위반(0xC0000005)으로 즉사한다. venv를 재구성하면 반드시
   `pip install "ctranslate2==4.4.0" "setuptools<81"`을 다시 실행할 것
   (setuptools<81은 ctranslate2 4.4.0의 pkg_resources 의존 때문).
2. **Whisper 모델은 HF 허브가 아니라 로컬 경로.** 전시장 네트워크에서 HF 다운로드가
   불안정해서 `poc/backend/models/whisper-small`에 직접 받아두고
   `.env`의 `MIRROR_TING_STT_WHISPER_MODEL`로 절대 경로를 지정했다.
   PC를 옮기면 `.env`의 이 경로를 수정해야 한다.
3. **EXAONE f16 KV 캐시 환경변수는 사용자 수준으로 등록됨**
   (`OLLAMA_KV_CACHE_TYPE=f16`, `OLLAMA_FLASH_ATTENTION=0`).
   macOS의 LaunchAgent 대신 Windows 사용자 환경변수를 사용한다.
   Ollama를 다른 계정으로 실행하면 다시 설정할 것.
4. **테스트 실행 시 `PYTHONUTF8=1` 필요** (한글 주석/출력의 cp949 문제).
   실행 예: `$env:PYTHONUTF8='1'; .\.venv\Scripts\python.exe -m pytest tests -q`
5. **알려진 이슈:** Windows에서 테스트 종료 시 `test_mirror-ting.db` 삭제가
   PermissionError로 실패하고, 남은 파일이 다음 실행의 tenancy 테스트를 깨뜨린다.
   테스트 전 `test_mirror-ting.db*` 삭제 후 실행하면 319 통과.

## 검증 결과 (2026-07-27)

- 백엔드 pytest: **350 통과 · 스킵 0** (Ollama 가동 상태 — 통합 테스트 포함 전부 실행)
- MVP: 테스트 19 통과 · 프로덕션 빌드 성공
- `/api/health` (직접 + Vite 프록시 경유 모두): `server_stt: "whisper"` ·
  `ollama: {dialogue: true, embedding: true}` · `semantic_match: true` · **`degraded: false`**
- Ollama 모델: `exaone3.5:2.4b`(1.6GB), `bge-m3`(1.2GB) 설치 완료
- 참고: 부팅 직후 첫 1분은 bge-m3 콜드 로드 때문에 `semantic_match: false`로 보일 수
  있다 — 60초 안에 자동 승격되므로 재확인하면 된다.

## 재검증 결과 (2026-07-29 — 저장소 폴더명 변경 후 전면 점검)

- **`.env` Whisper 경로가 구 폴더명(`2026CarpeDM_EXPO-main`)을 가리켜 깨져 있었다** —
  이 상태로 켜면 `/api/health`부터 500. 상대 경로(`./models/whisper-small`)로 고쳤고,
  코드도 낡은 절대 경로를 backend 루트 기준으로 구제하도록 보강(`app/ai/stt/base.py` —
  Whisper 로드 실패 시 Vosk 폴백 포함, 회귀 테스트 `tests/test_stt_paths.py`).
  §2의 "PC를 옮기면 경로 수정" 항목은 이제 자동으로 흡수된다.
- **Ollama가 0.32.4 → 0.32.5로 자동 업데이트돼 있었다.** 동작엔 문제없으나, 이 PC의
  bge-m3 임베딩은 **요청당 고정 ~3초**(단건 5회 15.1s vs 배치 20건 3.6s 실측).
  체크리스트 앵커를 단건 순차 임베딩하던 턴 경로가 첫 턴 60초+로 벌어져,
  **배치 임베딩(/api/embed) + 벽시계 예산 + 기동 시 앵커 프리웜**으로 재설계했다
  (`app/ai/semantic_match.py`). 현재 턴 지연 9~12초(임베딩 ~3s + exaone 생성 2회).
- 백엔드 pytest: **401 통과 · 스킵 0** (STT 경로·배치 임베딩 회귀 테스트 8개 추가 포함) ·
  MVP 테스트 49 통과 · 빌드 성공 · poc/frontend tsc/테스트 39/빌드/린트 통과
- REST 세션 E2E(전시 계약 그대로) 25항목 전부 통과: 동의 게이트 400 · IDOR 403 ·
  6턴 완주 · Whisper 라이브 STT 정확 전사(SAPI 한국어 TTS WAV) · 리포트 · 4자리 코드 ·
  재방문 이력. 의미 매칭 임계값 보정: 확충 골든 17점에서 0.68~0.80 전 구간
  인식 9/9·오탐 0 → **0.69 유지**.
- MVP 전시 결함 2건 수리: ① 어트랙트 오버레이가 닫힌 뒤 투명한 전체 화면 벽으로
  잔류해 터치를 전부 먹던 버그(framer-motion 중첩 exit 미완료 → CSS 클래스 전환으로
  재설계), ② 카메라·마이크 전면 거부 시 미리보기에서 막히던 문제(텍스트 입력 강등으로
  체험 계속 — 운영 문서의 "카메라 없이도 진행" 약속 이행).

## B2B/NFC 확장 (2026-07-31 — 기획 목표 A~G 반영)

- **NFC 리더 (ACR122U ×2, 결정 기록: `docs/plan/b2b/hardware-nfc-decision.md`)**
  - Windows는 표준 CCID 드라이버로 자동 인식된다(별도 설치 불요). 안 잡히면
    ACS 공식 드라이버 설치.
  - 브리지용 pyscard는 **선택 설치**다: `.\.venv\Scripts\pip.exe install pyscard`
    — 미설치·리더 미연결이면 백엔드 브리지가 자동 휴면하고 화면의 수동 폴백
    (직무 선택 버튼·UID 직접 입력)만 동작한다. CI에는 넣지 않았다(리눅스 러너 무관).
  - 리더 2대 연결 시 역할은 연결 순서다: 첫 번째 = mirror(미러), 두 번째 =
    kiosk(발급). 바꾸려면 `.env`의 `MIRROR_TING_NFC_READER_ROLES` 수정.
  - 발급 키오스크 화면: `http://localhost:5173/?kiosk=issue` (발급 전용 PC/모니터에서 열 것).
- **영수증 QR 클레임**: 관람객 휴대폰이 접근할 주소를 `.env`의
  `MIRROR_TING_CLAIM_BASE_URL`로 설정해야 QR이 유효하다(기본 localhost는 데모용).
- **보안(G-26)**: 계정 기능(웹앱·클레임)을 쓰는 순간 `.env`에
  `MIRROR_TING_JWT_SECRET`(32바이트+ 무작위)을 반드시 설정한다 — 생성:
  `.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"`.
  기관 납품 구성은 `MIRROR_TING_REQUIRE_SECURE=true` + `MIRROR_TING_ADMIN_AUTH_REQUIRED=true`.
  주의: `MIRROR_TING_ADMIN_TOKEN`을 설정하면 NFC 발급·태그 폴링(`/api/nfc/issue`,
  `/api/nfc/tap`)도 그 토큰을 요구한다 — 전시(단일 PC, 백엔드 127.0.0.1 바인딩)
  구성에서는 토큰을 비워 로컬 전용으로 운영하는 것이 기본이다. 기관 스탬프는
  UID 지식만으로는 인정되지 않고 최근 실물 태그 증거(2분)가 있어야 한다.
- **LLM judge**: 분석 시 Response-Fit에 루브릭 채점(n=3 중앙값, 30% 혼합)이 얹힌다.
  전시 중 분석이 느리면 `.env`에서 `MIRROR_TING_JUDGE_SAMPLES=0`으로 즉시 끌 수 있다
  (결정적 파이프라인만 사용 — 점수 산식은 기존과 동일해진다).
