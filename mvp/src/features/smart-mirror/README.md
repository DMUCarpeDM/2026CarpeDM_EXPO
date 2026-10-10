# Smart mirror interface

미러 전용 화면·자동 진행·시각 자산의 경계입니다. 기존 웹 사이트의 화면은 외부에 유지하며, App/PreviewPage/PracticePage에서 이 기능을 연결합니다.

- components: 제품 요약 화면과 실버 글래스 이미지 슬라이더
- data: 출근·업무·퇴근 안내 내용
- lib: 표시 시간/숨김 탭/동의 판정, 테스트
- styles: 미러 전용 표현
- assets: 출근·업무·퇴근 실버 글래스 PNG 3장
- previews: 동일 제품 컴포넌트를 사용하는 로컬 검토 화면

제품 진입: `/?service=workplace&mirror=1`. 실제 시작은 동의된 NFC 카드 및 카메라·마이크 준비를 필요로 합니다.

## 로컬 실제 입력 테스트

개발 서버에서 `/?mirror=1&service=workplace&test=live&idle=0`으로 접속합니다. 4K 화면 검토가 필요하면 `/src/features/smart-mirror/previews/nfc/4k.html?test=live&idle=0`을 사용합니다.

NFC 아이콘 클릭 → 분석 동의 → 카메라·마이크 권한 허용 → 요약 → 마이크 확인 → 장면 안내 → 대화 → 보고서 순서입니다. 사원증 대신 실제 익명 세션을 만들며, 동의와 미디어 권한은 생략하지 않습니다. `test=live`는 개발 빌드에서만 작동합니다.

한 번 이상 답변을 제출하면 `제출한 답변으로 결과 보기`로 중간 결과도 확인할 수 있습니다. 음성 인식을 사용할 수 없으면 텍스트로 답변할 수 있습니다. 보고서는 실제 세션의 API 결과를 사용하며 예시 점수를 채우지 않습니다. 응답은 Gemini 판단, 자세는 유효 표본이 충분할 때 모델 결과로 채점합니다. 표정·목소리 점수는 검증 전까지 보류합니다.

미러의 마이크 확인은 공통 실버 글래스 모달로 표시합니다. 주변 소음 2초와 짧은 문장 읽기 4초를 자동 녹음하며, 서버 확인을 포함해 최대 10초 후 닫힙니다. 확인이 지연되거나 실패하면 기준 미확인 상태로 음성 입력을 계속하고, 해당 목소리 측정은 점수에 포함하지 않습니다. 마이크 확인과 장면 안내 모달이 열려 있는 동안 대화 카드는 표시하지 않습니다. 일반 웹의 수동 마이크 확인 과정은 유지합니다.

백엔드는 `.env`의 Gemini 설정을 사용합니다. Vertex 인증을 사용하려면 `MIRROR_TING_GEMINI_API_BACKEND=vertex`, `MIRROR_TING_GEMINI_VERTEX_PROJECT`와 Google ADC 인증이 필요합니다. `/api/health`의 `dialogue_ready`로 연결 상태를 확인합니다. 키와 인증 파일은 저장소에 넣지 않습니다.

로컬 검토: `/src/features/smart-mirror/previews/flow/index.html`. NFC와 미디어를 사용하지 않으며 안내 후 검토 완료 문구를 표시합니다. 이전 prototype URL은 이곳으로 연결됩니다.

미러에는 터치가 없으므로 장면과 페이지는 자동 진행합니다. Chrome 탭/주소창 제거는 현장 운영 PC의 kiosk 모드로 설정합니다.

## 요약 화면 재설계 (2026-10-08)

`WorkplaceMirrorPreflight`는 동의·세션 준비·자동 시작을 담당하고, `WorkplaceMirrorOverview`는 장면 진행, 상황, 이미지, 상황 요약/목표, 다음 동작 안내를 표시합니다. 실제 세션의 선택 시나리오가 그대로 연결됩니다.

장면당 10초와 마지막 3초의 시작 안내 뒤 대화로 넘어갑니다(총 33초). 숨긴 탭은 읽는 시간을 소비하지 않습니다. 진행 막대는 transform으로 갱신하며 마지막 카운트다운에서 초기화하지 않습니다. 이미지 이동은 24px/400ms로 제한하고 reduced-motion에서는 이미지 이동을 제거합니다. 카드 문구는 장면과 함께 즉시 교체합니다.

`WorkplaceOverviewCard`는 선택한 Clear Glass 표면 위에 실제 상황·상대·목표를 표시합니다. `OverviewGlassMaterial`은 지연 로딩하며 GPU 미지원/초기화 실패 시 HTML과 CSS 표면을 유지합니다. 단계별 현재/예정/완료, 장면 배지, 진행 막대와 낮은 밝기의 이미지 후광을 적용했습니다. [적용 검증](./qa/clear-glass-overview.md).

4K 검토: `/src/features/smart-mirror/previews/flow/4k.html`. 실제 2160×3840 iframe을 창 크기에 맞춰 축소해 보여 줍니다. `?scene=morning|work|leaving`은 해당 장면을 정지해 검토합니다. 일반 제품 화면에는 검토용 프레임이 추가되지 않습니다.

## 분석 결과 대시보드

직장 대화의 미러 결과 화면은 `WorkplaceMirrorDashboard`를 사용합니다. `ServiceEntryShell → ResultPage`의 실제 세션 `report`, 분석 진행률과 오류를 전달하며, 기존 웹 결과 화면은 유지합니다. Clear Glass 카드(`WorkplaceOverviewCard`), `ScoreRing`, 공통 `Progress`를 재사용합니다. 종합 점수·4-Fit·잘한 점/개선점·답변 코칭을 표시하고, 누락된 점수는 미측정, 음성 측정 기록이 있는 Voice-Fit은 점수 보류로 구분합니다. 대화창은 화면 위에서 55%에 배치합니다.

미리보기: `/src/features/smart-mirror/previews/dashboard/4k.html`. 이 경로의 예시 데이터는 실제 결과가 아니며 제품 데이터 흐름에 포함되지 않습니다. `?state=empty|loading|error`로 상태를 확인할 수 있습니다. [QA 기록](./qa/analysis-dashboard.md).
