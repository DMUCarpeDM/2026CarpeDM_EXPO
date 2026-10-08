# 10/7 화면 QA 최소 수정

- 미러의 현재 질문은 검은 배경에서 읽을 수 있는 밝은 색을 사용한다. 일반 웹 입력 영역의 색은 유지한다.
- 카메라·마이크 권한 복구 안내는 음성 HUD 위에 배치한다.
- 완료 결과의 돌아가기는 홈으로 이동한다. 종료·분석 중 세션은 과거 연습 history로 돌아가도 결과로 이동한다. 재연습은 동의 화면을 거쳐 새 세션으로 시작한다.
- Netlify 정적 면접 데모는 입력 원문과 일반 연습 예시를 제공하고 검증되지 않은 개인 점수·순위·음성/영상 수치·빈 답변의 인용문을 만들지 않는다. 과거 정적 이력의 숫자도 점수 없음으로 처리한다.
- 정적 빌드 및 `?demo=result/practice` 예시 화면은 출처 안내를 표시한다. 명시적 샘플 탐색 기능은 유지한다.
- MVP의 운영 대시보드는 별도 운영 앱 주소를 확인하기 전까지 ‘연결 준비 중’으로 비활성화한다. 확인되지 않은 `/admin` 연결이나 추정 URL을 사용하지 않는다.

실제 backend의 Voice 점수 null/Expression 보류, 방문자 분리, 카드 동의와 epoch 검증을 유지한다. 이 수정은 물리 장비·유료 AI 품질의 합격을 의미하지 않는다.

```sh
cd mvp
node --test --test-isolation=none --test-force-exit src/lib/staticInterviewApi.test.js src/lib/visualReadiness.browser.test.js
npm run build
VITE_STATIC_DEMO=true npm run build
```

두 빌드를 별도 출력 폴더에 저장한 경우 `VISUAL_QA_MIRROR_DIST`와 `VISUAL_QA_STATIC_DIST`에 각각 절대 경로를 지정해 `visualReadiness.browser.test.js`를 실행하면 소스 Vite 대신 해당 production build를 Chrome에서 검사한다. `VISUAL_QA_ARTIFACTS`로 캡처 폴더를 지정할 수 있다. 테스트는 별도 브라우저 컨텍스트와 모의 API를 사용하고 물리 미디어 접근을 거부한다.

공개 제출 사이트의 문서상 연결은 `DMUCarpeDM/2026CarpeDM_EXPO` / `codex/interview-submission-deploy`다. 실제 Netlify 연결 브랜치·배포 커밋은 확인되지 않았다. 로컬 수정과 검사 이후 공개 반영은 배포 대상 확인·수정본 검토 후 별도 수행한다. 자동으로 push/merge/deploy하지 않는다.
