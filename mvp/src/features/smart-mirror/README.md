# Smart mirror interface

미러 전용 화면·자동 진행·시각 자산의 경계입니다. 기존 웹 사이트의 화면은 외부에 유지하며, App/PreviewPage/PracticePage에서 이 기능을 연결합니다.

- components: 제품 요약 화면과 실버 글래스 이미지 슬라이더
- data: 출근·업무·퇴근 안내 내용
- lib: 표시 시간/숨김 탭/동의 판정, 테스트
- styles: 미러 전용 표현
- assets: 출근·업무·퇴근 실버 글래스 PNG 3장
- previews: 동일 제품 컴포넌트를 사용하는 로컬 검토 화면

제품 진입: `/?service=workplace&mirror=1`. 실제 시작은 동의된 NFC 카드 및 카메라·마이크 준비를 필요로 합니다.

로컬 검토: `/src/features/smart-mirror/previews/flow/index.html`. NFC와 미디어를 사용하지 않으며 안내 후 검토 완료 문구를 표시합니다. 이전 prototype URL은 이곳으로 연결됩니다.

미러에는 터치가 없으므로 장면과 페이지는 자동 진행합니다. Chrome 탭/주소창 제거는 현장 운영 PC의 kiosk 모드로 설정합니다.

## 요약 화면 재설계 (2026-10-08)

`WorkplaceMirrorPreflight`는 동의·세션 준비·자동 시작을 담당하고, `WorkplaceMirrorOverview`는 장면 진행, 상황, 이미지, 상황 요약/목표, 다음 동작 안내를 표시합니다. 실제 세션의 선택 시나리오가 그대로 연결됩니다.

장면당 18초와 마지막 3초의 시작 안내 뒤 대화로 넘어갑니다(총 57초). 숨긴 탭은 읽는 시간을 소비하지 않습니다. 진행 막대는 transform으로 갱신하며 마지막 카운트다운에서 초기화하지 않습니다. 이미지 이동은 24px/400ms로 제한하고 reduced-motion에서는 이미지 이동을 제거합니다. 카드 문구는 장면과 함께 즉시 교체합니다.

`WorkplaceOverviewCard`는 선택한 Clear Glass 표면 위에 실제 상황·상대·목표를 표시합니다. `OverviewGlassMaterial`은 지연 로딩하며 GPU 미지원/초기화 실패 시 HTML과 CSS 표면을 유지합니다. 단계별 현재/예정/완료, 장면 배지, 진행 막대와 낮은 밝기의 이미지 후광을 적용했습니다. [적용 검증](./qa/clear-glass-overview.md).

4K 검토: `/src/features/smart-mirror/previews/flow/4k.html`. 실제 2160×3840 iframe을 창 크기에 맞춰 축소해 보여 줍니다. `?scene=morning|work|leaving`은 해당 장면을 정지해 검토합니다. 일반 제품 화면에는 검토용 프레임이 추가되지 않습니다.
