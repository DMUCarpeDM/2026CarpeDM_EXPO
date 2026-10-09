# 상황 요약 카드 재제작 검토

적용 스킬: better-ui, better-layout, better-typography, better-colors.
범위: shader-cards 비교 시안 3종. 실제 미러 요약 컴포넌트 적용은 포함하지 않음.

| 원칙 / 심각도 | 위치 | Before | After | Why |
| --- | --- | --- | --- | --- |
| 중요도·읽기 순서 / MEDIUM | main.jsx:43 | 상대 첫마디가 주 콘텐츠 | 상황 제목 → 실제 상황 → 상대 → 연습 핵심 | 대화에 들어가기 전에 맥락을 이해하도록 함 |
| 정보 그룹 / MEDIUM | style.css:40 | 첫마디와 목표 중심 구조 | 내부 8–20px, 그룹 간 32px, 본문·상대 묶음 | 관련 내용을 가깝게 두고 정보 단계 구분 |
| 글자 위계 / MEDIUM | style.css:44 | 인용문 22px 중심 | 상황 제목 28px, 설명 16px, 목표 15px, 메타 13px | 제목으로 빠르게 파악하고 본문으로 보완 |
| 색 역할 / LOW | style.css:28,52 | 구분선에 개별 색 지정 | card-divider 의미 토큰으로 통합 | 밝은 크롬과 어두운 재질의 구조 색 관리 |

## 검증

- 실제 시나리오 order=4의 situation·character_id·question_intent 연결 확인. initial_question 렌더링 제거.
- 브라우저 1280px: 3개 모두 WebGPU 렌더링, 카드 잘림 없음, console error 없음.
- 390px iframe: document width/scrollWidth=390px. 카드 폭 342px, 가로·세로 내용 잘림 없음.
- 2160px iframe: document width/scrollWidth=2160px. 비교 페이지 최대 폭 1440px 안에서 카드 폭 443px, 내용 잘림 없음.
- 1440px iframe + RTL + root font 32px: width/scrollWidth=1440px. 카드 폭 443px, 내용 잘림 없음. 실제 브라우저 zoom이 아닌 200% 텍스트 확대 검사.
- 최종 캡처의 패딩 배경 표본 대비(보조 글자 색): Glass 11.42:1, Chrome 6.76:1, Metal 8.98:1. 모든 글자 위치·애니메이션 프레임의 전수 검증은 아님.
- 별도 Vite 시안 빌드 통과. 셰이더 번들 크기 경고 유지.
- 캡처: workspace `output/mirror-shader-cards/summary-rebuild.png`.

## Not verified

실제 4K 미러의 가독성·FPS·유리 투과율, 브라우저 200% zoom, 긴 번역 문구, 스크린리더, reduced-motion OS 변경, GPU 실패 상태, 10% 속도 애니메이션 재생 검증은 수행하지 않음. 기존 fallback/reduced-motion 처리 유지.

검증한 비교 시안 범위에 미해결 HIGH 없음.

**Approve**
