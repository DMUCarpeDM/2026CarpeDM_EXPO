# Smart mirror interface

미러 전용 화면·자동 진행·시각 자산의 경계입니다. 기존 웹 사이트의 화면은 외부에 유지하며, App/PreviewPage/PracticePage에서 이 기능을 연결합니다.

- components: 제품 요약 화면과 픽셀 PNG 장면
- data: 출근·업무·퇴근 안내 내용
- lib: 표시 시간/숨김 탭/동의 판정 및 캐릭터 이동, 테스트
- styles: 미러 전용 표현
- assets: 생성 PNG와 스프라이트, Galmuri woff2와 OFL 라이선스
- previews: 동일 제품 컴포넌트를 사용하는 로컬 검토 화면

제품 진입: `/?service=workplace&mirror=1`. 실제 시작은 동의된 NFC 카드 및 카메라·마이크 준비를 필요로 합니다.

로컬 검토: `/src/features/smart-mirror/previews/flow/index.html`. NFC와 미디어를 사용하지 않으며 안내 후 검토 완료 문구를 표시합니다. 이전 prototype URL은 이곳으로 연결됩니다.

미러에는 터치가 없으므로 장면과 페이지는 자동 진행합니다. Chrome 탭/주소창 제거는 현장 운영 PC의 kiosk 모드로 설정합니다.
