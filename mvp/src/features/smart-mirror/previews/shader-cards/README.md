# Shader material comparison

검토 URL: `/src/features/smart-mirror/previews/shader-cards/index.html`

`shaders@4.0.2`의 Glass, Chrome, BrushedMetal을 사용한다. 동일한 업무 시나리오의 상황·대화 상대·연습 목표를 HTML로 표시하며 Shader는 배경 재질만 담당한다. 기존 제품의 요약 화면은 변경하지 않는다.

현재 카드: [상황 요약 카드 검토](./summary-review.md). 상황 본문은 `episode.situation`, 상대는 `character_id`, 목표는 `question_intent`에서 가져온다. 짧은 제목은 고정된 업무 4번 시나리오를 위한 편집 문구다. 첫 대사는 표시하지 않는다.

- React 19 peer dependency 범위 확인 후 정확한 버전으로 설치.
- WebGPU 지원 여부 및 onReady/onUnavailable을 확인해 실제 렌더링과 CSS 대체 상태를 구분.
- 카드 크기에 맞춰 roundedRectSDF의 종횡비 조정.
- 느린 반사 속도 .08; reduced-motion에서는 반사 이동 정지.
- telemetry 비활성화. 라이선스 원문은 SHADERS-LICENSE.txt에 보관.
- 인앱 브라우저에서 3개 모두 실제 WebGPU 렌더링, 카드 가로 잘림 없음, 콘솔 error 없음 확인.
- 제품 빌드와 해당 시안 HTML을 입력으로 한 별도 Vite 빌드 통과. 셰이더 시안 번들은 minified 약 2.84MB / gzip 792KB로 제품 적용 시 지연 로딩 검토가 필요하다. 실제 운영 PC에서 4K FPS는 측정하지 않았다.
- 증거: workspace `output/mirror-shader-cards/comparison.png`.

검토 보고서: https://www.lazyweb.com/report/lazyweb/2493cf2b-f168-4c78-b771-cac843f764c0/

컴포넌트 개선 및 검증: [review.md](./review.md). 개선 캡처: workspace `output/mirror-shader-cards/polished.png`.
추가 디자인 검토: https://www.lazyweb.com/report/lazyweb/fa736d55-1e4d-4665-94b9-63b0bd7a50df/
