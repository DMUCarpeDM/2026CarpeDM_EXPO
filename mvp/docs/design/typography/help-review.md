# 사용방법 타이포그래피 비교 및 신규 화면 QA

범위: 사용방법 첫 화면과 5개 가이드, 연습 기록 목록/상세, FAQ 목록/4개 상세, 편집기, 요금제, 로그인/회원가입, 로그인 후 메인. React/CSS와 기존 미러팅 폰트 및 mode 토큰 유지. 기준은 저장된 Perplexity help.html / help-article.html의 computed style이다. 실시간 원본의 최신 디자인 일치 여부는 검증하지 않았다.

## 실측 비교

| 역할 | 변경 전 | Perplexity 클론 | 조정 후 |
| --- | --- | --- | --- |
| 첫 화면 H1 | 36px/700, 모바일 28px/700 | 48px/500, 모바일 36px/500 | 48px/500, 모바일 36px/500 |
| 문서 H1 | 32px/700, 모바일 28px/700 | 48px/500, 모바일 36px/500 | 48px/500, 모바일 36px/500 |
| 문서 H2 | 23px/700 | 27px/500 | 27px/500 |
| 문서 설명 | 16px/400, 행간 1.7 | 18px/400, 약 1.56 | 18px/400, 행간 1.6 |
| 문서 본문 | 16px/400, 행간 1.8 | 16px/400, 행간 1.65 | 16px/400, 행간 1.65, 65ch 상한 |
| 주제 제목 | 24px/700 | 22px/500 | 22px/500 |

폰트: Perplexity는 GT Standard, 미러팅은 기존 SF Pro/Pretendard/한국어 시스템 폰트 스택. 글꼴 자체의 동일성을 주장하지 않는다. 한글 긴 제목의 3줄 이상 줄바꿈을 위해 좁은 화면 H1 행간 1.4, H2 행간 1.4를 적용. Perplexity 영문 H1 행간 1.08을 그대로 쓰지 않았다.

## Findings

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM, resolved | src/styles/lovable-layout.css:354; :362; :365 | 기본 H1/H2 굵기 700, 작은 제목, 본문 행간 1.8 | 역할별 크기·500 굵기·본문 1.65 | 참고 화면보다 두껍고 작은 제목과 과한 본문 행간으로 위계가 달랐음 |
| LOW, resolved | src/styles/lovable-layout.css:357; :358 | 주제 24px/700, 카드 제목 20px/700 | 주제 22px/500, 카드 18px/500 | 설명 콘텐츠보다 제목이 과하게 무거웠음 |
| HIGH, resolved (Layout) | src/styles/lovable-layout.css:378 | 320px 인증 폼의 account-card 오른쪽 좌표 374px | grid-template-columns:minmax(0,1fr) | 자동 그리드 트랙이 350px 카드 폭을 유지해 작은 화면에서 입력창·버튼이 넘쳤음 |

## Verification

- `node output/layout-qa/typography-measure.mjs`: 390/1440px 기준 클론과 미러팅의 변경 전 computed font-size/font-weight/line-height/font-family 실측.
- `node output/layout-qa/typography-all-pages-qa.mjs`: 320/390/768/1440px에서 사용방법 6개 화면의 단일 H1·48/36px·500 굵기, 문서 H2 27px/500 및 본문 16px 확인. 모든 문서 200% CSS zoom 가로 넘침 없음. 같은 4해상도에서 로그인/가입 3개 소셜 버튼·계속하기·시연 진입 확인. 320px 인증 넘침 수정 후 재실행 통과.
- `node output/layout-qa/library-help-qa.mjs`: 4해상도 도움말 검색/초기화/상세/새로고침, 기록 검색/즐겨찾기/상태/상세 탭 통과. 기록은 QA 전용 fixture.
- `node output/layout-qa/faq-spacing-qa.mjs`: 320/390/720/768/1440px FAQ 목록·답변 이동·키보드 Enter·포커스·RTL 넘침 검사 통과.
- `node output/layout-qa/faq-all-details-qa.mjs`: 4개 답변 × 4해상도 직접 진입·H1·가로 넘침 검사.
- `node output/layout-qa/editor-spacing-qa.mjs`: 4해상도 편집기 좌우 구조/모바일 전환/대화 유지, 요금제 3열·1열/결제 주기/FAQ 링크 검사 통과. AI는 모의 응답.
- `node output/layout-qa/dashboard-structure.mjs`: 390/768/1440px 중앙 정렬·패널 배치·모바일 메뉴·템플릿 선택 통과.
- `node output/layout-qa/dashboard-start-qa.mjs`: 390/1440px 빈 입력·기존 입력 모두 상단 AI 버튼 실제 클릭→편집기→준비 요청 통과.
- 렌더링 이미지: type-all-*.png, type-quickstart-*.png, auth-type-*.png 등 output/layout-qa/에 저장. reference computed metrics: typography-before.json, 수정 후: typography-after.json.
- `npm run build`, `git diff --check`.

Not verified: OS 스크린리더, iOS Safari 실기, 브라우저 자체 네이티브 200% 확대(CSS zoom만 검사), 실제 AI 품질·소셜 인증·결제·기록 자동 저장. 이 검증은 전체 서비스의 모든 상태에 대한 접근성 인증이 아니다.

## Verdict
Approve — 명시한 타이포그래피 및 화면 흐름 검사 범위에 한함. 확인된 HIGH 잔여 항목 없음.
