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
