# Voice

Iris Light의 음성 기능은 메인 `.venv`와 분리된 `.venv-voice` 런타임을 사용합니다.
FastAPI 런타임은 **`127.0.0.1:18765`에만** 바인딩됩니다.  
> Updated-at: 2026-08-25

## 현재 실제로 되는 것

- 설정창 음성 섹션 저장/로드 (SQLite `voice_prefs_v1`) — 기본 prefs: STT/TTS **off**
- 마이크 녹음 → STT → **UserTurn으로 채팅 턴 제출** (`UserTurnDispatcher`; 입력창만 append하지 않음)
- 연속 발화 · barge-in · wake word(설정) · Silero VAD · AEC · STT 큐
- 답변별 🔊 수동 TTS, `tts_mode=auto` 시 최종 답변 후 자동 TTS
- 알림·전화 상황 낭독 + 규칙 기반 음성 인텐트
- 문장 분할 순차/스트리밍 재생 / 중지 / 캐시 정리
- 녹음 폴더 분석 → `~/.iris-light/voice/manifest.jsonl` + `manifest.csv`
- 추천 참고 음성 top 5, 기준 음성/대본 확정
- **IRIS 보이스 프로필** — 화자 임베딩으로 상황별 톤 자동 전환
- **mock 모드**에서 STT/TTS HTTP 경로 검증 (모델 다운로드 없이)

## mock 기본값 (혼동 주의)

| 경로 | 기본 |
|------|------|
| 앱 prefs `voice_runtime_mock` | **False** (실모드로 기동 시도) |
| 환경변수 `VOICE_RUNTIME_MOCK` (런타임 config) | 프로세스에 넘기지 않으면 `"1"` |
| `setup_voice_runtime` 스모크 | mock=1 권장 |

앱이 런타임을 띄울 때 prefs의 mock 값을 자식 환경에 반영합니다.

## 아직 제한된 것

- 실제 faster-whisper / Qwen3-TTS 품질은 `.venv-voice`에 모델 설치 + mock 해제 후 별도 검증 필요
- 이 노트북(RTX 4050 6GB, flash-attn 없음)에서는 **실시간 불가**: 프로필 적용 전 RTF 약 8배,
  ICL 참조가 붙는 프로필 경로는 **약 11~13배**(4초 문장에 50~70초). 모델을 1.7B → 0.6B로 줄여도
  동일 → 병목은 모델 크기가 아니라 느린 어텐션 경로. 실시간이 필요하면 고정 멘트 캐싱 /
  별도 GPU 서비스 / 클라우드 TTS 필요.
- 같은 톤·같은 문장은 생성 결과를 파일 캐시에서 바로 돌려준다(재생성 없음).
- m4a 등 비-WAV는 `soundfile`(+시스템 디코더)이 있어야 길이/RMS 분석 가능
- QTextEdit 기반 채팅이라 스피커 상태는 아이콘(🔊/⏳/▶/⚠) 수준
- 6GB VRAM에서는 TTS 파인튜닝 불가. 프로필은 파인튜닝이 아니라 **화자 임베딩 추출/집계**다.

## IRIS 보이스 프로필

`iris/assets/voice/iris_voice_profile.npz` + `.json` (약 51KB).
녹음 원본(m4a)은 `.gitignore` 대상이라 커밋되지 않지만, 이 프로필만 있으면
**원본 오디오 없이 같은 목소리로 합성된다.**

담긴 것:

| 항목 | 설명 |
|--|--|
| `base_x_vector` | 녹음 150개 화자 임베딩의 이상치 제거 평균 (1024차원) |
| 톤별 `x_vector` | 상황별 평균 임베딩 |
| 톤별 `ref_code` | 대표 녹음 1개의 스피치 코드. ICL 모드에서 억양·속도를 복제 |
| 톤별 `ref_text` | 그 대표 녹음의 전사문 (ICL에 필요) |

### 톤

파일명이 대본이 아니라 감정/상황 라벨이라, 그 라벨을 6개 정규 톤으로 접었다.

| 톤 | 상황 | 출처 |
|--|--|--|
| `neutral` | 담담한 보고·안내 | E, A(차분·공감·정중·사과) |
| `question` | 확인·선택 질문 | C |
| `briefing` | 나열·요약 브리핑 | D, A(경쾌·설득·기쁨) |
| `caution` | 경고·거절·오류 | G, A(단호·놀람) |
| `numeric` | 숫자·시간·경로 낭독 | B |
| `narration` | 중길이 설명 낭독 | H |

합성할 때 `services/voice_runtime/tone_router.py`가 문장을 같은 체계로 분류해
맞는 톤을 고른다. 우선순위는 **경고 > 질문 > 나열 > 숫자 > 길이**다.

빈정거림·짜증·한탄·화남·머뭇거림 10개는 연기된 부정 감정이라 비서 기본 음성에
어울리지 않고 평균 음색을 흐려서 **기본 프로필에서 제외**했다.

### 다시 빌드하기

```powershell
.\.venv-voice\Scripts\python.exe scripts\build_voice_profile.py "아이리스 녹음"
```

전사는 faster-whisper가, 임베딩은 Qwen3-TTS speaker encoder가 맡는다.
6GB VRAM에서 둘을 동시에 못 올리므로 전사를 전부 끝낸 뒤 whisper를 내리고 TTS를 올린다.

### 귀로 확인하기

```powershell
$env:VOICE_RUNTIME_MOCK=0
.\.venv-voice\Scripts\python.exe scripts\preview_voice_profile.py
```

톤마다 대표 문장을 합성해 `~/.iris-light/audio/preview/<톤>.wav`에 모아 둔다.

### 끄는 법

설정 `tts_use_voice_profile=false` → 기존 단일 기준 음성 경로로 돌아간다.
`tts_tone_routing=false` → 프로필은 쓰되 항상 `neutral` 톤.

## 설치

```powershell
# mock/스모크용 (권장 기본)
.\scripts\setup_voice_runtime.ps1

# 실제 TTS 모델까지
.\scripts\setup_voice_runtime.ps1 -Full
```

또는

```bat
.\scripts\setup_voice_runtime.bat
.\scripts\setup_voice_runtime.bat -Full
```

## 녹음 폴더 분석

기본 폴더(존재 시 사용, 예전 `1차 아이리스 녹음` 이름은 폴백):

`<프로젝트>/아이리스 녹음`

```powershell
# 메타만 (전사 생략)
$env:VOICE_RUNTIME_MOCK=1
.\.venv-voice\Scripts\python.exe scripts\prepare_voice_dataset.py "경로" --no-transcript

# 설정창: 녹음 폴더 선택 → "녹음 폴더 분석"
```

결과:

- `~/.iris-light/voice/manifest.jsonl`
- `~/.iris-light/voice/manifest.csv`

## 기준 음성 선택

1. 추천 목록에서 미리듣기/선택
2. 참고 대본을 사용자가 수정
3. **기준 음성 확정** → `voice_clone_prompt` hash 캐시
4. 테스트 문장으로 생성/재생 확인

## mock vs 실제

| | mock (`VOICE_RUNTIME_MOCK=1`) | 실제 (`0`) |
|--|--|--|
| STT | `[mock stt] …` 고정 문구 | faster-whisper |
| TTS | 무음 wav 생성 | Qwen3-TTS voice clone |
| 용도 | UI/연동/테스트 | 실제 음성 |

모델 미설치여도 메인 앱(채팅/Wiki/이메일)은 계속 사용 가능합니다.

## 데이터 경로

- 생성 음성: `~/.iris-light/audio/generated/`
- manifest/선택: `~/.iris-light/voice/`
- 모델 캐시: `~/.iris-light/models/`

## 개인정보 / 동의

- 음성 데이터는 로컬에서만 처리됩니다.
- 성우 본인의 동의와 사용 권한이 필요합니다.
- 제3자 목소리 무단 복제는 금지입니다.
