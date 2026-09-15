# Mirror-Ting 전시 프론트엔드

관람객용 React/Vite 앱입니다. 새 환경 설치는 [새 팀원 시작 안내](../docs/developer-onboarding.md)를 따르세요. 실제 대화와 분석은 `../poc/backend`에 연결합니다.

## 실행

이 디렉터리에서 실행합니다.

```bash
npm ci
npm run setup-offline
npm run dev
```

`setup-offline`은 MediaPipe 모델과 wasm을 준비하는 명령으로, 인터넷이 되는 환경에서 최초 1회 실행합니다. Chrome에서 `http://localhost:5173`을 열고 카메라·마이크 권한을 허용하세요. 백엔드 기본 연결 주소는 `http://127.0.0.1:8001`입니다.

```bash
# 백엔드를 다른 포트로 실행했다면 주소를 지정합니다.
MIRROR_TING_API_TARGET=http://127.0.0.1:8000 npm run dev
```

## 수정할 파일 찾기

| 작업 | 파일·폴더 |
| --- | --- |
| 화면 연결 | `src/App.jsx`, `src/pages/ServiceEntryShell.jsx` |
| 서비스별 홈 | `src/components/home/` |
| 연습 진행·녹음 | `src/pages/PracticePage.jsx` |
| Chrome 받아쓰기·자동 제출 | `src/lib/usePracticeTranscription.js` |
| API 요청·녹음 업로드 완료 대기 | `src/lib/pocApi.js` |
| 상대 음성 재생 | `src/lib/turnSpeechPlayback.js` |
| 얼굴 추적·화면 표시 | `src/lib/useFaceTracking.js`, `src/lib/faceTrackingOverlay.js` |
| 결과 표시 | `src/pages/ResultPage.jsx` |

## 음성 기능을 수정할 때

Chrome STT는 실시간으로 답변 입력창을 채웁니다. 인식 실패나 미지원 환경에서는 직접 입력을 사용하며, Whisper로 실시간 전사를 대신하지 않습니다.

녹음은 답변 텍스트와 별도로 업로드합니다. 다음 질문은 먼저 받을 수 있지만 최종 분석 요청은 진행 중인 녹음 업로드가 끝날 때까지 기다립니다. 업로드에는 30초 제한이 있고 실패한 녹음은 간투어 미측정으로 남습니다.

Whisper의 간투어 전사·집계는 백엔드에서 실행합니다. 결과의 `filler_count`가 `null`이면 0으로 바꾸지 마세요. 간투어 수치는 추정치이며 점수에 반영하지 않습니다.

## 확인

```bash
npm test
npm run build
```

화면만 확인할 때는 `?demo=practice`, `?demo=result`, `?demo=compare`를 사용할 수 있습니다. 데모 결과는 실제 분석이 아닙니다. 실제 체험에서는 녹음 재생과 결과까지 확인하세요.
