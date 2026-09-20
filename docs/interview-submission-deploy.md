# 면접 서비스 제출 배포

제출용 빌드는 `VITE_SERVICE_MODE=interview`로 고정되어 서비스 선택 화면 없이 면접 홈으로 진입한다. 로컬 기본 실행은 기존 세 가지 서비스 선택 흐름을 유지한다.

## 로컬 확인

```bash
docker build -t mirror-ting-interview .
docker run --rm -p 8001:8001 \
  -e MIRROR_TING_JWT_SECRET='충분히-긴-임의값' \
  -e MIRROR_TING_ADMIN_TOKEN='충분히-긴-임의값' \
  -e MIRROR_TING_OPENAI_API_KEY='OpenAI-API-key' \
  -v mirror-ting-data:/app/storage \
  mirror-ting-interview
```

브라우저에서 `http://localhost:8001`을 열고 면접 홈, 직무 선택, 질문 응답, 결과 리포트까지 확인한다.

## Render 배포

1. GitHub에 검증된 변경을 push한다.
2. Render Dashboard에서 **New > Blueprint**를 선택하고 이 저장소의 `render.yaml`을 연결한다.
3. 생성 화면에서 `MIRROR_TING_OPENAI_API_KEY`를 입력한다.
4. ElevenLabs 음성을 사용할 때만 해당 key와 voice ID를 입력한다. 비워 두면 브라우저 TTS를 사용한다.
5. 배포 후 `/api/health`와 실제 면접 1회를 확인한다.

SQLite DB, 업로드 음성, 최초 다운로드되는 Whisper 모델은 `/app/storage`의 영구 디스크에 저장된다. 카메라와 마이크는 HTTPS로 제공되는 Render 기본 도메인에서 사용할 수 있다.

## Netlify 무료 제출용 배포

구독 없이 제출 링크를 운영할 때는 루트의 `netlify.toml`을 사용한다. Netlify 빌드는
`VITE_SERVICE_MODE=interview`, `VITE_STATIC_DEMO=true`로 고정된다.

- 공개 제출 URL: `https://mirror-ting-interview.netlify.app/`
- 배포 브랜치: `codex/interview-submission-deploy`

- 풀스택·마케팅·세일즈 면접 질문과 세션 진행은 브라우저에서 동작한다.
- 카메라 MediaPipe 분석, 브라우저 음성 인식·음성 합성은 그대로 사용한다.
- 답변과 결과 이력은 방문자의 `localStorage`에만 저장된다.
- Python Whisper·Sentence Transformers·OpenAI 대화 서버는 Netlify 정적 배포에 포함되지 않는다.
- 새로고침 뒤에도 현재 브라우저의 완료 이력은 남지만 다른 기기와 동기화되지 않는다.

## 제출 화면

- 대표 이미지: 면접 홈 hero
- 스크린샷 1: 면접 홈
- 스크린샷 2: 지원 직무 선택
- 스크린샷 3: 면접 진행
- 스크린샷 4: 분석 진행 또는 결과 요약
- 스크린샷 5: 코칭 리포트

모든 제출 이미지는 16:9로 캡처한다.
