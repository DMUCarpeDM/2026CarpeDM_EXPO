# Mirror-Ting 백엔드와 별도 웹앱

전시 화면은 [mvp](../mvp/README.md), 분석 API는 이 디렉터리의 `backend/`를 사용합니다. `frontend/`는 별도 웹앱이므로 전시 화면과 수정 위치를 혼동하지 마세요. 처음 설치하는 순서는 [새 팀원 시작 안내](../docs/developer-onboarding.md)에 있습니다.

## 백엔드 실행

환경 변수와 모델 준비 후, 이 디렉터리에서 실행합니다.

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

- 준비 상태: `http://127.0.0.1:8001/api/health`
- API 문서: `http://127.0.0.1:8001/docs`
- 테스트: `backend/`에서 `.venv/bin/python -m pytest -q`

첫 실행 시 SQLite 테이블과 시나리오 시드를 준비합니다. 기존 테이블 변경은 `create_all`만으로 반영되지 않습니다. 실제 데이터가 있는 DB를 삭제해 해결하지 말고, 스키마 변경과 데이터 이관 방법을 먼저 정하세요.

## 현재 분석 구성

| 기능 | 구현 |
| --- | --- |
| 역할극 대화 | 서버 GPT-4o. 키가 없으면 실제 대화를 시작할 수 없습니다. |
| 상대 음성 | ElevenLabs, 실패 시 프론트의 브라우저 TTS |
| 실시간 받아쓰기 | 프론트 Chrome STT, 실패 시 직접 입력 |
| 간투어 추정 | 로컬 faster-whisper `small` + 간투어 프롬프트 |
| 응답 의미 매칭 | 로컬 E5. 모델이 없으면 키워드 판정만 사용 |
| 목소리 분석 | `app/ai/voice_fit.py`의 음성 처리 |
| 표정·자세·시선 | 브라우저 MediaPipe 측정값을 서버가 집계 |

Vosk와 `/api/sessions/{session_id}/stt` 실시간 전사 API는 제거했습니다. 과거 문서의 Ollama 대화·완전 오프라인 체험·서버 STT 대체 경로 설명은 현재 구성에 적용하지 않습니다.

## 코드 위치

| 경로 | 역할 |
| --- | --- |
| `backend/app/core/config.py` | 환경 변수와 기본값 |
| `backend/app/models/` | DB 모델 |
| `backend/app/api/sessions.py` | 답변·녹음 업로드·체험 종료 API |
| `backend/app/services/analysis.py` | 턴별 분석과 결과 저장 |
| `backend/app/ai/stt/base.py` | Whisper 로딩·간투어 프롬프트 전사 |
| `backend/app/ai/paralinguistics.py` | 간투어 집계·세션 요약 |
| `backend/app/services/report.py` | 결과 리포트 구성 |
| `backend/tests/` | 백엔드 회귀 테스트 |

## 모델과 데이터

Whisper는 `backend/`에서 다음 명령으로 준비합니다.

```bash
.venv/bin/python scripts/setup_offline_stt.py
```

파일은 `backend/whisper-models/small/`에 저장합니다. 기본 설정과 같은 경로이며 Git에서 제외합니다. 테스트용 `stt-lab` 서버는 삭제했고 제품에서 사용하지 않습니다.

로컬 E5 가중치는 모델 담당자에게 받아 `backend/models/response_e5_v1/final/`에 둡니다. 다른 위치를 쓰면 `MIRROR_TING_LOCAL_E5_MODEL_DIR`을 설정하세요. 개인 PC의 절대 경로나 심볼릭 링크를 새 팀원 환경에 그대로 복사하지 마세요.

DB는 기본적으로 `backend/mirror-ting.db`, 녹음은 `backend/media/`에 저장합니다. 녹음은 동의·보관 정책에 따라 삭제될 수 있습니다. Supabase로 연결하려면 별도 DB·인증·저장소 이관 작업이 필요합니다.
