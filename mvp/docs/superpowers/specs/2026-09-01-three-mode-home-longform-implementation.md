# 3개 Home 장문 랜딩 구현 계획

1. `HomePage.jsx`의 기존 모드별 UI와 상호작용을 보존하며 장문 섹션을 재배치한다.
2. 실제 사용 맥락용 사진 3장을 생성하고 `src/assets/home-scenes/`에 저장한다.
3. 두 모드 이상에서 재사용되는 `ProductStage`, `ContextVisual`, `EvidenceStrip`만 공통 프리미티브로 추가한다.
4. 기존 Apple Light 런타임 토큰을 사용해 `mode-home.css`와 `preflight-refresh.css`의 Home 규칙을 보강한다.
5. 모드별 섹션 존재, CTA 연결, 반응형 규칙을 테스트에 추가한다.
6. 전체 테스트와 프로덕션 빌드를 통과시킨다.
7. 사용자가 선택한 인앱 브라우저에서 동일 뷰포트 캡처를 만들고 참고 화면과 시각 비교한다.
8. `design-qa.md`가 `final result: passed`가 될 때까지 P0~P2를 수정한다.

## 변경 파일

- `src/pages/HomePage.jsx`
- `src/styles/mode-home.css`
- `src/styles/preflight-refresh.css`
- `src/lib/kioskLayout.test.js`
- `src/assets/home-scenes/*`
- `design-qa.md`

## 보호 범위

- `PracticePage.jsx`와 실제 시뮬레이션 로직은 수정하지 않는다.
- 기존 사용자 변경과 통합 리포트 작업을 되돌리지 않는다.
- 새로운 라우트나 백엔드 의존성을 추가하지 않는다.
