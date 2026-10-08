# Shader 카드 컴포넌트 개선 검토

범위: 비교 시안의 Glass / Chrome / BrushedMetal 카드. `better-ui`, `better-layout`, `better-typography`, `better-colors`를 적용했다. 실제 요약 화면 적용 및 스마트 미러 하드웨어 검증은 포함하지 않는다.

| 원칙 / 심각도 | 위치 | Before | After | Why |
| --- | --- | --- | --- | --- |
| 시각적 위계 / MEDIUM | style.css:39–49, main.jsx:44–46 | 보조 글자가 작고 대사와 목표가 흩어져 보임 | 대사 22px, 목표 15px, 메타 정보 13–16px로 구분하고 간격 정리 | 상대 → 첫 대사 → 연습 목표 순으로 읽기 쉽게 함 |
| 표면 / MEDIUM | style.css:24–39, main.jsx:16–31 | 두꺼운 재질 가장자리와 강한 금속 결 | 베벨·결·하이라이트 축소, 외곽 20px와 안쪽 17px 반경 정렬 | 장식보다 시나리오 문장이 먼저 보이게 함 |
| 대비 / HIGH, 해결 | style.css:25–28,50 | 움직이는 셰이더 배경 위 텍스트의 대비 보장 부족 | 어두운 카드와 밝은 Chrome에 각각 읽기용 반투명 표면 적용 | 반사 밝기 변화에도 텍스트 대비 확보 |
| 재배치 / MEDIUM | style.css:20–21,62 | 작은 화면과 글자 확대 대응 근거 부족 | 내용 기반 자동 열 배치, 가변 높이, 논리적 여백 적용 | 텍스트를 자르지 않고 화면 폭에 따라 재배치 |

## 검증

- 인앱 브라우저: 세 재질 모두 실제 WebGPU 상태 확인.
- 390px iframe: 한 열, document clientWidth/scrollWidth 모두 390px, 카드 내용 잘림 없음.
- 1440px iframe + RTL + 루트 글자 32px(200% 텍스트 확대): 가로 넘침과 카드 내용 잘림 없음. 실제 브라우저 zoom 검증과는 구분한다.
- 2160px iframe: 가로 넘침 없음. 비교 페이지 최대 폭은 1440px 유지.
- 별도 시안 Vite 빌드 통과. 셰이더 번들의 크기 경고는 남아 있어 제품 반영 시 지연 로딩 검토 필요.
- 반투명 읽기 표면을 불투명 흰색/검정 셰이더 배경에 합성한 WCAG 대비 계산: 어두운 카드 보조 글자 최저 5.14:1, Chrome 보조 글자 최저 6.40:1.
- 실제 캡처의 카드 패딩 배경 표본과 보조 글자 색 비교: Glass 11.31:1, Chrome 6.69:1, Metal 8.98:1. 전체 프레임의 모든 글자 픽셀을 측정한 결과는 아니다.
- 증거: workspace `output/mirror-shader-cards/polished.png`. 재현용 iframe: `qa.html?width=390`, `qa.html?width=1440&rtl=1&zoom=1`, `qa.html?width=2160`.

## Not verified

실제 65인치 4K 기기의 가독성·유리 투과율·FPS, 실제 브라우저 200% zoom, 긴 번역 문구, OS reduced-motion 전환, WebGPU 실패 상태의 실기기 렌더링, 화면 낭독기 검증은 수행하지 않았다. 소스의 reduced-motion 및 CSS 대체 처리는 유지했다.

검증한 비교 시안 범위에서 미해결 HIGH 없음.

**Approve**
