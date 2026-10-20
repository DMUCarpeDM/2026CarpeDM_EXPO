# 개인 소비 시나리오 집중 개선

2026-10-15 사용자 요청: 다른 전시 상황을 비활성화하고, 소비 상황의 심문 같은 질문을 줄이며 선을 넘을 듯한 반존대를 적용한다.

## 진단 및 적용 방향

기존 EXHIBITION_ACTOR_SYSTEM_PROMPT와 _exhibition_actor_prompt가 매 발화를 후속 질문으로 끝내도록 강제했다. 거절 뒤에도 이유·조건·다음 질문 허가를 확인하도록 해 경계를 존중한다는 규칙과 충돌했다. 소비 시나리오의 목표 역시 소비·저축 방식의 이유를 이해하는 것으로 적혀 있어 정보 확보에 집착할 여지가 있었다.

이번에는 목표를 자기 기준으로 참견하는 선배의 가벼운 대화로 바꿨다. 답변에 먼저 반응하고, 충분한 설명이나 비공개·조언 거부를 들으면 질문 없이 이견·인정·마무리할 수 있다. 금액→비율→횟수→이유→계획을 순서대로 요구하지 않는다. 거절 뒤 이유·대체 개인정보·질문 허가·실천 약속도 요구하지 않는다. AI 배우와 평가 기준은 계속 분리하며 채점 로직은 수정하지 않았다.

해요체와 짧은 반말 반응을 섞는 반존대를 페르소나와 전시 전용 시스템 프롬프트에 일치시켰다. 예: 그래요?, 그렇구나, 난 좀 다르게 보는데, 내가 좀 참견했네. 이는 말투 예시이며 실제 생성 결과가 아니다. 욕설·인격 비하·위협·너/야 호칭은 금지한다. 일반 면접·훈련의 ROLEPLAY_SYSTEM_PROMPT는 그대로 둔다.

## 변경 파일

- poc/backend/app/seed/workplace-exhibition.json: 네 장면 중 order=15만 enabled=true. 다른 세 장면은 보존하되 false. 소비 장면의 첫 대사·페르소나·배경 목표·대화 범위·진행 의도 조정.
- poc/backend/app/services/workplace.py: 활성 장면만 선택하며 비활성 fixed_order도 거부. 전시 미리보기와 선택 자원이 복원 가능하도록 원본 목록 유지.
- poc/backend/app/services/dialogue/openai_provider.py: 전시 전용 규칙과 마지막 생성 지시에서 강제 질문 제거, 반존대 및 경계 존중 일치. 생성문 그대로 전달하는 기존 계약 유지.
- mvp/src/features/smart-mirror/previews/{flow,simulation}/main.jsx: 비활성 장면을 요청해도 활성 소비 장면으로 선택. 미리보기 첫 대사는 전시 장면의 opening_line을 사용.
- poc/backend/tests/test_{fixed_workplace_scene,workplace_exhibition}.py: 활성 장면 선택·비활성 고정 선택 거부·5회 진행 회귀 검증.

기존 세션은 시작 시 저장한 시나리오/페르소나를 갖고 있으므로 새 체험부터 완전히 적용된다. 5회 답변 형식은 유지한다. 대화가 일찍 정리되면 질문 없는 반응이 가능하지만, 조기 종료 상태 전이는 이번 범위에 없다. 일반 시나리오 팩이나 면접·카페 훈련을 삭제하거나 비활성화하지 않았다.

## 실제 검증

- 백엔드: .venv/bin/python -m pytest tests/test_fixed_workplace_scene.py tests/test_workplace_exhibition.py tests/test_actor_passthrough.py -q → 40 passed, 1 failed.
- 실패: test_contradiction_keeps_scoring_but_does_not_inject_fixed_question. 대사 전달은 통과하나 즉시 응답에 contradiction 채점 이벤트가 있다고 가정하는 단언 실패. 변경 전 세 파일을 별도 테스트 프로세스 메모리에 로드해 같은 테스트를 실행해도 동일하게 실패함을 확인했다. 기존 지연 채점 관련 문제를 이번 범위에서 수정하지 않았다.
- 프론트: node --test src/features/smart-mirror/lib/workplaceOverview.test.js src/features/smart-mirror/lib/workplaceMirrorTimeline.test.js → 8 passed.
- npm run build → 통과. 기존 큰 번들 경고 존재.
- git diff --check → 통과.
- 실제 로컬 백엔드 8001을 재시작. /api/health HTTP 200, dialogue_ready=true, degraded=false. 프론트 5173 HTTP 200.
- 브라우저: flow 미리보기에서 scene=morning을 요청해도 개인 소비를 간섭하는 선배 표시 확인. simulation 미리보기에서 새 첫 대사 표시 확인. 카메라·마이크와 실제 체험 시작은 실행하지 않았다.
- 캡처: output/consumer-scene-overview-20261015.png.
- 백업: output/consumer-scene-backup-20261015/.

## 남은 실응답 검증

OpenAI(api.openai.com)에 수정한 프로젝트 프롬프트와 가상 답변을 전송하는 3개 흐름의 실응답 검증은 자동 승인 검토에서 거절되었다. 프롬프트 payload 외부 전송의 명시적 사용자 승인이 없다는 이유이며, 우회하지 않았다. 실제 사용자 녹음·재정 정보는 테스트 계획에도 포함하지 않는다. 모델이 실제로 반존대·경계 규칙을 준수한다는 주장은 아직 하지 않는다. 승인을 받으면 공개 범위 제한 / 자발적 소비 설명 / 거절·정정의 세 흐름을 실제 모델로 확인할 수 있다.
