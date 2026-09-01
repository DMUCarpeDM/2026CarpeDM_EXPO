# Design QA — 3개 모드 Home 장문 랜딩 개편

## 비교 기준

- source visual truth: 사용자가 제공한 PLCO Coach 메인 페이지 스크린샷 14장
- 대표 소스:
  - `/var/folders/7_/hvbb4n0509q5cl8rb3fvlmch0000gn/T/TemporaryItems/NSIRD_screencaptureui_Kqfc09/스크린샷 2026-09-01 오전 11.57.05.png`
  - `/var/folders/7_/hvbb4n0509q5cl8rb3fvlmch0000gn/T/TemporaryItems/NSIRD_screencaptureui_bOHYPW/스크린샷 2026-09-01 오전 11.57.52.png`
  - `/var/folders/7_/hvbb4n0509q5cl8rb3fvlmch0000gn/T/TemporaryItems/NSIRD_screencaptureui_SYQXdN/스크린샷 2026-09-01 오전 11.58.07.png`
- source dimensions: 3024×1964 원본(대화 입력에서는 1971×1280으로 축소 표시)
- implementation target: `http://127.0.0.1:5175/`
- implementation screenshot: 확보하지 못함
- implementation viewport: 확인하지 못함
- states to compare:
  - 면접 Home
  - 직업훈련 Home
  - 직장대화 Home
  - 데스크톱 우선, 모바일 반응형 보조

## 구현 확인

- 세 모드가 공통 장문 랜딩 골격을 사용하면서 모드별 시각 계층과 콘텐츠 구성을 다르게 유지함
- 서비스 UI를 설명하는 제품 프리뷰, 수치 근거, 맥락 이미지, 마지막 CTA를 추가함
- 기존 Apple Light 토큰과 기존 진입·CTA 동작을 유지함
- 실제 시뮬레이션 화면은 변경하지 않음
- 생성 이미지는 WebP로 최적화하여 모드별 1장씩 적용함

## 자동 검증

- `npm test`: 119/119 통과
- `npm run build`: 통과
- `git diff --check`: 통과
- 자동 검증은 렌더링 정상 여부와 픽셀 일치 여부를 보증하지 않음

## 시각 비교 증거

- full-page source capture: 확보됨(사용자 제공 14장)
- full-page implementation capture: 미확보
- focused comparison input: 미생성
- same-viewport comparison: 미실행
- iteration history: 구현 전 소스 분석 → 코드 구현 → 자동 검증 완료. 브라우저 캡처 단계에서 중단됨

## 미완료 사유

선택된 인앱 브라우저에서 로컬 URL 접근·캡처가 URL 정책으로 차단되었습니다. 정책상 다른 브라우저, Playwright CLI, raw CDP, 우회 URL 등으로 같은 결과를 시도할 수 없어 실제 구현 화면과 참조 화면을 동일 뷰포트로 합성 비교하지 못했습니다.

시각 QA를 완료하려면 아래 중 하나가 필요합니다.

1. 현재 면접·직업훈련·직장대화 Home의 동일한 창 크기 데스크톱 스크린샷 3장
2. 브라우저 정책에서 허용되는 접근 가능한 프리뷰 URL

final result: blocked
