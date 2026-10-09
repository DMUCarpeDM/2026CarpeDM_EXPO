# 분석 결과 대시보드 QA — 2026-10-08

- 실버 글래스 카드, ScoreRing, Progress 재사용. 미러 직장 대화 ResultPage에 연결. 웹 결과 화면 유지.
- 대화창 상단 비율 0.55를 실제 DOM으로 확인. 인물 영상 크기는 유지.
- 2160×3840에서 대시보드 client/scroll 크기 모두 2160×3840. 예시 결과의 하단 설명 위치 3521px로 화면 내부에 있음.
- ResultPage를 직접 렌더한 4K 미리보기에서 예시 결과, 미측정, 분석 진행 42%, 오류 상태 확인.
- 미측정 점수와 코칭에 임의 값을 넣지 않음. 0점은 측정값으로 유지. Voice-Fit 보류 및 표정 참고 지표 구분 테스트.
- `node --test src/lib/reportFits.test.js src/lib/unifiedReport.test.js src/features/smart-mirror/lib/*.test.js`: 17개 통과.
- `npm run build`: 통과. 기존 대용량 청크 경고 있음.
- 추가 serviceEntryRoute 브라우저 테스트는 실패했으며 통과로 집계하지 않음. 요청 범위의 UI 검증은 CUA로 수행.
- 개발 서버의 오래된 React 최적화 캐시로 공통 Progress가 비던 문제는 같은 포트에서 `--force` 재최적화 재시작 후 해결. 설정/의존성 변경 없음.
- 미리보기 예시 데이터와 실제 세션 데이터 분리. 실제 분석 API/NFC/장치로 처음부터 끝까지 수행하는 검증은 이번 작업에서 수행하지 않음. 서버 보고서의 매우 긴 문구와 현장 유리 투과율은 별도 현장 검증 필요.

증거: workspace `output/mirror-shader-cards/mirror-dashboard.png`, `simulation-dialogue-55.png`.
