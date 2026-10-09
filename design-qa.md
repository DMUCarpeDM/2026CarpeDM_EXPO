# 직장대화 지도형 시작 화면 적용 검증

## 비교 대상

- Source visual truth: `mvp/prototypes/workplace-preview/screenshots/06-office.jpg` (1488 × 1058 pixels).
- Implementation: `mvp/prototypes/workplace-preview/screenshots/office-production-desktop.jpg` (1488 × 1082 pixels, full page).
- Viewport: 1488 × 1058 CSS pixels, desktop; 390 × 844 CSS pixels, mobile.
- Density: desktop reference and implementation screenshots both 1×; no density rescaling required. Implementation full-page height includes the existing app container's extra bottom space.
- State: 출근 선택, 분석 동의 해제, 준비 상태 접힘.
- Mobile evidence: `mvp/prototypes/workplace-preview/screenshots/office-production-mobile.jpg`.
- Runtime route: `http://127.0.0.1:5174/?service=workplace` → 연습 시작하기.

## 비교 결과

동일한 데스크톱 폭의 시안과 실제 화면을 한 비교 입력에서 확인했음. 좌측 입체 지도, 우측 상황 안내와 시작 버튼, 하단 시간대 이동이라는 구성을 유지함. 세 공간의 버튼 위치와 지도 이미지가 대응함. 모바일은 지도 다음에 상황과 시작 버튼이 배치되며 가로 넘침 없음(문서 폭과 화면 폭 모두 390px).

작은 글씨가 읽히는 크기로 전체 화면과 모바일 화면을 확인했으므로 별도 확대 영역은 불필요했음.

### 필수 확인 항목

- 글꼴·크기: 앱의 기존 한글 글꼴을 계승함. 큰 제목, 장면 제목, 안내 문장의 계층과 줄 간격을 유지함.
- 배치·간격: 데스크톱은 지도/안내 2열, 모바일은 1열. 기존 앱 상단 내비게이션과 페이지 여백은 서비스에 맞게 유지함.
- 색상·상태: 선택 공간과 시간대는 파랑, 미선택 공간은 흰색. 동의 전 시작 버튼은 회색이며 비활성화됨.
- 이미지: 시안에 사용한 생성 지도 원본을 그대로 앱 자산으로 연결함. 스크린샷 전체를 화면에 붙이지 않았으며 조작부는 실제 버튼임.
- 문구: 시각과 대사가 예시임을 명시함. 개인정보·서버 처리 안내와 실제 AI/장비 상태를 펼쳐 확인할 수 있음.
- 접근성: 네이티브 버튼/체크박스, 선택 상태 aria-pressed, 장면 변경 aria-live, 포커스 표시, 지도 대체 텍스트, 모션 감소 설정 지원.

## 허용된 서비스 연결 차이

- 시안 전용 로고와 내비게이션 대신 기존 서비스 내비게이션을 유지함.
- 시안의 데모 안내를 실제 분석·저장 안내와 실제 장비 상태로 바꿈.
- 시간대 진행 표시는 점 대신 선택 구간의 선으로 표시함. 동일한 세 단계 버튼과 이동 기능을 유지함.
- 선택 장면은 미리보기로만 사용함. 실제 연습 시작은 기존 onNext/startPractice 연결을 그대로 사용하여 출근부터 진행함.

## 수정 이력

- [P2, 수정 완료] 기존 서비스 버튼 스타일이 새 화면의 비활성 색상과 모서리를 덮었음. 새 화면 내부에만 적용되는 CSS 우선순위를 높였으며 최신 캡처에서 회색 비활성과 사각형 모서리를 재확인함.
- 브라우저 크기 변경이 기존 탭에서 시간 초과되어 새 검증 탭에서 모바일/데스크톱 확인을 완료함. 임시 화면 크기는 기본값으로 복원함.
- 남아 있는 P0/P1/P2 시각 문제 없음.

## 실행 확인

- 홈의 연습 시작하기 → 실제 지도형 시작 화면 진입 확인.
- 지도 버튼, 하단 시간대 버튼 및 다음/이전 이동과 장면 내용 동기화 확인.
- 첫 장면의 이전 버튼, 마지막 장면의 다음 버튼 비활성 확인.
- 분석 동의 체크 시 시작 활성화, 해제 시 비활성 확인.
- 분석·저장 안내를 펼쳐 실제 AI/마이크/카메라 상태 확인.
- 검증 탭 브라우저 콘솔 error 0건.
- Vite production build 통과(기존 큰 청크 경고 있음).
- workplaceTrack 단위 테스트 2개 통과.
- 기존 kioskLayout 테스트는 변경하지 않은 PracticePage, setupCatalog, home 관련 조건에서 3개 실패함. 이번 작업에서 해당 부분은 수정하지 않았음.
- 카메라/마이크 권한을 부여하거나 실제 녹음을 수행하지 않았으므로 녹음 이후의 대화 전체 흐름은 이번 검증 범위 밖임.

final result: passed

## 추가 검토 지적사항 수정 · 2026-10-04

- 안내 문장 세 곳의 색상을 기존 `--mode-muted` 토큰(`#707070`)으로 변경함. 실제 브라우저 계산 색상은 모두 `rgb(112, 112, 112)`이며 흰 배경 대비는 약 4.95:1임.
- 동의 체크박스를 시작 버튼 앞으로 이동함. 실제 키보드에서 Space로 동의한 후 Tab을 누르면 활성화된 ‘출근부터 시작하기’로 이동함. 3px 파란 포커스 테두리도 확인함.
- 수정 후 320px 화면의 문서 폭이 320px로 가로 넘침 없음.
- 빌드, workplaceTrack 테스트 2개, `git diff --check` 통과함. 기존 큰 청크 경고는 남아 있음.
- 재검증 캡처: `/private/tmp/workplace-interface-improved.jpg`, `/private/tmp/workplace-interface-improved-320.jpg`.
- 위 두 지적사항 재검증 통과. 실제 녹음·전체 접근성 인증은 이번 확인 범위에 포함하지 않음.

## 마이크 확인 팝업 · 선택 시안 3 적용 · 2026-10-04

- Source visual truth: `/Users/yanghyojae/.codex/generated_images/019fbb80-4349-7433-a46a-29cfa8545a77/exec-117611c8-8ede-4a29-8a00-df974ad07058.png`.
- Implementation: `/private/tmp/mic-check-split-desktop.jpg`, `/private/tmp/mic-check-split-mobile.jpg`, `http://127.0.0.1:5174/`의 실제 열린 마이크 확인 팝업.
- State: 녹음 전 ready. 배경은 기존 실행 세션 그대로이며 시안의 가상 배경과 비교 대상이 아님.
- Viewport: 데스크톱 요청 1440×1024, 브라우저 확대 배율로 실제 DOM 폭 1600px. 모바일 요청 390×844, 실제 DOM 폭 433px. 캡처와 원본의 물리 픽셀을 직접 일치한다고 주장하지 않으며 팝업 구성과 비율 중심으로 비교함. 팝업 CSS 폭 820px, 좌우 열 280/540px. 모바일 단일 열 및 팝업 가로 넘침 없음.
- Comparison evidence: 원본과 실제 캡처를 같은 도구 입력에서 확인함. 팝업 내 문구·아이콘이 충분히 읽히므로 추가 확대 영역은 불필요했음.
- Fonts/typography: 기존 한글 글꼴 계승, 제목 28px·설명 15px·단계명 18px. 시안의 제목/본문/단계 위계를 유지함.
- Spacing/layout: 왼쪽 마이크 안내와 오른쪽 두 단계·세로 버튼 배치, 연한 파랑 면과 구분선 유지. 모바일에서는 왼쪽 패널을 상단의 짧은 안내로 재배치함.
- Colors/tokens: 흰색, 파랑 `--voice-accent`, 회색 본문 사용. 버튼과 아이콘의 실제 계산 색상 파랑 확인.
- Image/icon quality: 기존 Reicon의 마이크·음파·대화 아이콘 사용. 팝업 전체를 이미지로 붙이지 않았음. 시안의 장식 음파는 읽기용 안내에 필수적이지 않아 생략함.
- Copy/content: 목소리 크기 비교 용도와 검사 녹음 삭제 안내는 원래 제품 문구를 유지. 녹음·전송·검사 로직은 변경하지 않음.
- Iteration: [P2, 수정 완료] 첫 캡처에서 아이콘이 검정으로 표시됨. 아이콘 라이브러리의 인라인 색상에 디자인 토큰을 연결하고 최신 캡처 및 계산 색상 `rgb(0,113,227)`으로 재확인함.
- Interaction: Tab으로 시작 버튼 → 건너뛰기 버튼 이동 확인. 브라우저 console error 0건. 실제 녹음 및 서버 검사 완료는 실행하지 않았으며 기능 검증 범위 밖임.
- Build 통과. 기존 큰 청크 경고 있음. 선택하지 않은 4개 이미지 파일은 복구 가능한 사용자 휴지통으로 이동함.

final result: passed

## 마이크 팝업 축소·아이콘 재대조 · 2026-10-04

- Source: 위 선택 시안 3, 1488×1058px. Implementation: `/private/tmp/mic-check-compact-desktop.jpg`(942×625px), `/private/tmp/mic-check-compact-mobile.jpg`(481×1041px).
- State: 같은 ready 팝업. 데스크톱 CSS viewport 942×625, 모바일 요청 390×844 및 실제 CSS viewport 433×938. 캡처 밀도는 각각 약 1배/1.11배이며 전체 이미지 픽셀을 1:1로 비교하지 않고 팝업 내부를 비율 기준으로 대조함. 배경과 포커스 테두리는 기존 세션 상태임.
- [P2, 수정 완료] 이전 마이크에 받침대·장식 파형이 없고 원형 배경이 단일 색상이었음. 선택 시안을 참고한 투명 이미지로 받침대, 양쪽 파형, 두 겹의 옅은 원 배경을 반영함. 소음 단계는 SoundwaveCircle 대신 Soundwave로 교체해 불필요한 내부 원을 제거함.
- 이미지 생성: built-in Image Gen 사용. 최종 에셋 `mvp/src/assets/voice-check-microphone.png`. 프롬프트 요약: 선택 시안의 마이크·받침대·좌우 파형·옅은 두 원을 독립 투명 에셋으로 재현하고, 두 번째 생성에서 발광·그림자를 제거함. 생성 재현물이라 원본 픽셀과 완전히 동일한 파일은 아님.
- Layout: 폭 820→615px(25% 감소), 좌우 280/540→210/405px. 실제 ready 높이 약 548→425px(약 22% 감소). 본문을 읽을 수 있도록 글자와 버튼은 단순 0.75배보다 크게 유지함. 모바일은 단일 열이며 양쪽 화면 모두 팝업 가로 넘침 없음.
- Typography: 제목 22px, 본문 13px, 단계명 15px, 주의 문구 12px. 기존 한글 글꼴 유지. 모든 문구가 잘리거나 겹치지 않음.
- Colors: 기존 파란 버튼 토큰을 유지. 왼쪽 패널 #eaf3ff, 단계 아이콘 배경 #e6f0ff. 실제 토큰 색상은 현재 디자인 시스템 변경을 그대로 계승함.
- Assets: 투명 PNG의 마이크 발과 파형·두 겹 원이 실제 화면에서 확인됨. 단계 아이콘은 기존 라이브러리 사용. 별도 확대 없이 같은 비교 입력의 원본/최신 데스크톱/모바일에서 모양과 글자가 충분히 판독됨.
- Copy: 기존 제품 안내문 유지. 시안과 다른 용도 설명은 의도적인 기존 기능 보존임.
- Interaction: 시작 버튼에서 Tab으로 건너뛰기에 이동함. 포커스 표시 유지, 콘솔 error 0건. 실제 녹음은 실행하지 않음. 음성 파형 단위 테스트 5개 통과, 빌드 및 diff check 통과.
- 남아 있는 P0/P1/P2 없음. 생성물의 픽셀 단위 차이는 P3 후속 조정 가능 항목으로 남김.

final result: passed
