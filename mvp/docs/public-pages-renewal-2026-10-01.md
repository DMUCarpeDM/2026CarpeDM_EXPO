# 사이트 소개·결과 및 기록·사용방법 리뉴얼

## 범위

React + Vite, 기존 shared Button/Card/Accordion 및 `design-system-runtime.css`의 색상·간격·모서리 토큰을 재사용했다. 참고 구현은 메인 `StudioIntro`와 서비스 선택 화면이다. 변경 범위는 세 페이지, `front-improvements.css`의 public-page 규칙, 새 브라우저 테스트다. 기존 사용자 변경, 물결 배경, API, 세션, 분석 로직, 완료 리포트 컴포넌트는 수정하지 않았다. 커밋·푸시하지 않았다.

## 점검 범위

| 영역 | 확인 근거 | 결과 |
| --- | --- | --- |
| Accessibility | 페이지별 h1/main, FAQ Enter/Space, 포커스 표시, 이미지 대체 텍스트 | 점검 범위 내 통과. 스크린리더 실기 검증 제외 |
| Layout | 세 페이지 실제 화면, 320/390/768/1440px | 가로 넘침 없음. 메인과 본문 폭 및 간격 통일 |
| Writing | 안내 문구, 실제 홈 이동 콜백, 기록 상태 | 사용 순서·권한 복구 안내 추가, 이전 리포트 조회 제한 명시 |
| Typography | 제목·본문·FAQ computed styles와 화면 | h1/h2 위계 조정, FAQ 과도한 굵기 축소 |
| Colors | 기존 mode 토큰, 소개·사용방법 DOM 텍스트 대비 점검 | 자동 검사에서 실패 없음. 반투명·그라데이션 배경은 검사 제외 |
| UI | 기존 카드·버튼·4-Fit 아이콘과 서비스 이미지 | 기존 자산 재사용, 모바일 카드 배열 조정 |

## 발견 및 수정

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | Writing | src/pages/UsagePage.jsx:25 | FAQ만 제공 | 연습 4단계, 사전 준비, 권한 안내 후 FAQ | 첫 이용자가 실제 진행 순서를 알 수 있도록 함 |
| MEDIUM | Writing | src/pages/ResultsHistoryPage.jsx:7 | null·빈 문자열 점수가 0점 | 점수 없음과 실제 0점 구분 | 미제공 값을 평가 결과로 오인하지 않도록 함 |
| MEDIUM | Layout | src/pages/ResultsHistoryPage.jsx:29 | 현재 결과·재연습 안내 카드 반복 | 현재 상태와 홈 이동을 한 패널로 통합 | 다음 행동을 명확히 함 |
| LOW | Typography | src/styles/front-improvements.css:1 | 좁은 본문, h1과 비슷한 h2, 굵은 FAQ | 본문 최대 폭 1180px, 제목 단계 구분 | 기존 메인과 일관된 읽기 흐름 |
| LOW | UI | src/pages/SiteIntroPage.jsx:28 | 작은 일반 아이콘 중심 카드 | 기존 서비스 이미지와 4-Fit 자산 활용 | 서비스 선택 화면과 시각적으로 연결 |

## 검증

- `npm run build`: 통과. 기존 대형 청크 경고는 남아 있음.
- `node --test --test-concurrency=1 src/lib/publicPages.browser.test.js src/lib/introWaves.browser.test.js`: 3/3 통과.
- 실제 브라우저: 세 페이지 진입, 화면 폭 320/390/768/1440, 단일 h1/main, 이미지 로드, 가로 스크롤 확인. 오류 없음.
- 새 테스트: 세 페이지 홈 복귀, FAQ Enter/Space 열기·닫기 및 포커스, 최근 3개 기록과 null/빈 문자열/0점 표시. API는 모의 응답 사용.
- 기존 물결 배경의 일시정지·모바일·reduced-motion 회귀 테스트 통과.
- 테스트용 독립 렌더링의 React 초기화/모듈 import 문제는 수정 후 재실행하여 통과. 제품 오류가 아니었음.
- `git diff --check`: 통과.
- 전체 테스트 스위트는 이번 변경에서 재실행하지 않았다.

### 미검증 및 후속

실제 백엔드 연결, 연습 녹음, 분석 완료 리포트, 저장 기록 조회, 카메라·마이크 실제 권한 전환, 스크린리더·브라우저 확대는 검증하지 않았다. 기록 로딩/실패의 별도 상태와 과거 리포트 상세 보기는 기존 기능의 한계로 남는다. 후속 기능 작업에서 API 상태 계약을 확인한 후 다룰 필요가 있다.

### 화면 증거

`/Users/yanghyojae/Documents/Expo Design/output/playwright/interface-qa/`:

- `public-intro-before.png`, `public-intro-after.png`, `public-intro-mobile.png`
- `public-records-before.png`, `public-records-after.png`
- `public-usage-before.png`, `public-usage-after.png`, `public-usage-guide-after.png`

## Verdict

Approve — 위에 명시한 프론트엔드 변경 범위의 검증에 한함. 실제 API를 포함한 서비스 전체 승인이나 접근성 적합성 인증을 의미하지 않는다.
