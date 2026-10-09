# 스마트 미러 인터페이스 QA · 2026-10-09

## 범위와 기준

요약 → 직장 대화 시뮬레이션 → 분석 결과 대시보드를 화면 단위로 검토했다. React 19, Vite, Framer Motion, Radix Progress, 기존 ScoreRing, 공통 WorkplaceOverviewCard를 사용한다. `CLAUDE.md`, 개인 설정, 요청된 better 계열 7개 스킬과 review-animations/STANDARDS.md를 기준으로 했다. 실버 글래스 색상·기존 4K 배치·실제 세션 및 분석 데이터 연결을 유지한다. NFC·음성 분석 로직과 별도 작업 파일은 변경하지 않는다.

| Domain | 검토 범위 | 결과 |
|---|---|---|
| Accessibility | 헤딩·랜드마크·상태 알림·일시정지·키보드·포커스·미측정 표현 | 소스 및 브라우저 AX/DOM 검증, 실제 화면 읽기 도구는 미검증 |
| Layout | 2160×3840, 320×640, 카드 분리·줄바꿈·55% 대화 위치 | 두 해상도 검증, 장문 실제 세션은 미검증 |
| Writing | 상황 요약·결과 헤딩·오류 시 다음 행동 | 운영자에게 결과 재조회 요청 안내, 자연스러운 결과 제목 적용 |
| Typography | viewport 단위 축소·본문/보조 글자·숫자 | 최소 본문 1rem, 보조 .8125rem, 제목 최소 크기 적용 |
| Colors | 실버 팔레트·영상 위 카드·밝은 의상과 겹침 | 대화 카드의 어두운 채움과 보조 글자 대비 보완, 모든 영상 프레임 대비 보장은 미검증 |
| UI | 공통 카드 내부 테두리·반경·조작 영역·유리 질감 | 내부 반경을 실제 inset에서 계산, 44px 최소 조작 높이, 기존 채광 유지 |
| Motion | 이미지 전환·진행률·일시정지·reduced motion | 280ms 전환, transform 진행률, 자동 재생 제어 및 소스 분기 검증 |

## 발견 및 수정

경로는 `mvp/src/features/smart-mirror/` 기준이며 위치는 수정 후 소스이다. HIGH는 수정 전 영향이며 미수정 HIGH를 의미하지 않는다.

| Severity | Domain | Location | Before | After | Why |
|---|---|---|---|---|---|
| HIGH | Typography / Accessibility | styles/workplace-mirror-dashboard.css:8, styles/workplace-mirror-overview.css:34, styles/workplace-mirror-simulation.css:14 | 320px에서 대시보드 본문 약 8px, 지표 설명 약 6px | 본문 16px·보조 13px 하한, 제목 20/24px 하한 | 좁은 화면에서도 읽을 수 있게 한다. 4K 크기는 기존 계산 유지 |
| HIGH | Accessibility / Motion | components/WorkplaceMirrorPreflight.jsx:38, components/WorkplaceMirrorOverview.jsx:45 | 요약 자동 전환을 사용자가 멈출 수 없음, 동작 줄이기에서도 타이머 진행 | 일시정지·재개, 정지 시 이전/다음 장면, 동작 줄이기에서는 명시적 재개 전 자동 진행 중단 | 읽기 시간을 확보한다. 기본 미러 흐름은 자동 진행이며 운영자 키보드로도 제어 가능 |
| HIGH | Layout / Accessibility | styles/workplace-mirror-simulation.css:26 | 고정 55% 카드와 overflow:hidden 때문에 긴 내용/입력이 잘릴 수 있음 | 좁거나 낮은 화면에서는 문서 흐름 카드·세로 스크롤, 55dvh 시작 유지 | 글자를 축소하지 않고 내용 접근을 허용 |
| MEDIUM | Layout | styles/workplace-mirror-dashboard.css:44, styles/workplace-mirror-overview.css:100, styles/workplace-mirror-flow.css:49 | 좁은 화면에서도 두 열과 화면 높이 비례 간격 유지 | 카드 내용 한 열, 충분한 간격, 자연스러운 높이 | 읽기 순서를 유지하고 가로 넘침 방지 |
| MEDIUM | Accessibility | components/WorkplaceOverviewCard.jsx:24, components/WorkplaceMirrorDashboard.jsx:13 | 모든 카드가 atomic live region, 상위 busy 상태가 진행 알림까지 감쌈 | 공통 live 기본 off, 요약 장면만 polite; 결과의 status/alert는 독립적으로 사용 | 카드 전체 반복 알림과 진행 알림 지연 위험 감소 |
| MEDIUM | Writing | components/WorkplaceMirrorDashboard.jsx:15 | 오류 상태에도 결과가 준비되면 표시한다는 대기 안내 | 운영자에게 분석 결과 재조회 요청을 안내 | 실패 상태에서 다음 행동을 명확하게 함 |
| MEDIUM | Accessibility / UI | components/WorkplaceMirrorDashboard.jsx:20 | 미측정 항목에도 값 0의 progressbar 노출 | 미측정은 대시와 상태 텍스트만 노출, 실제 0점은 측정값으로 유지 | 미측정과 낮은 점수를 시각·의미상 구분 |
| MEDIUM | Colors | styles/workplace-mirror-simulation.css:1 | 움직이는 인물 뒤로 아주 투명한 카드 채움 | 대화 카드에 한해 어두운 반투명 채움과 #e0e5ef 보조 글자 | 의상·밝은 배경 변화 위에서 텍스트 안정성 향상 |
| LOW | UI / Layout | styles/workplace-mirror-overview.css:74, styles/workplace-mirror-dashboard.css:33 | 내부 반경을 별도 상수로 계산, 물리적 left 구분선 | 바깥 반경에서 inset을 뺀 내부 반경, logical 방향 구분선 | 크기에 따른 곡률 일치와 읽기 방향 대응 |
| LOW | Writing | components/WorkplaceMirrorDashboard.jsx:25 | 다음 대화로 가져갈 것 | 다음 대화에서 기억할 점 | 결과 화면의 목적을 익숙한 한국어로 표현 |

## 애니메이션 리뷰

| Before | After | Why |
|---|---|---|
| 요약 이미지 400ms, 배경 페이드 700ms | 기본 280ms, cubic-bezier(.23, 1, .32, 1); reduced 150ms 페이드 | 읽기 단계의 전환을 짧고 부드럽게 전달 |
| 준비 화면에서 850ms 화면 전체 수평 이동 | 150ms opacity만 사용 | 대기·동의 상태에 불필요한 공간 이동 제거 |
| 준비 화면의 width 기반 진행률 | scaleX, transform-origin:left | 레이아웃 재계산을 유발하는 속성 제거 |
| 숨긴 탭만 타이머 중단 | 사용자 일시정지와 reduced motion에도 중단, 재개 시 누적 읽기 시간 유지 | 자동 안내를 제어할 수 있게 함 |
| 점수 링/막대 기존 전환 | reduced motion에서 transition/animation 제거 | 선호 설정에 일관되게 대응 |

Tier 1: 자동 재생 제어, reduced motion 분기를 보완했다. 실제 OS 설정 전환은 Not verified.
Tier 2: 검토한 전환은 opacity/transform 사용. progress의 80ms linear는 시간 진행 표시여서 유지했다.
Tier 3: 정적 결과 카드와 장식에는 새로운 움직임을 추가하지 않았다.
판정: 검토한 소스 범위에서 **Approve**. 기기 성능·모든 영상 프레임·실제 음성 타이밍까지 승인한 것은 아니다.

## 검증

- 관련 Node 테스트 **19/19 통과**: reportFits, unifiedReport, smart-mirror/lib. 반복 일시정지/재개 누적 시간을 회귀 테스트로 추가.
- `npm run build` 통과. 기존 500kB 초과 청크 경고는 남아 있음.
- `git diff --check` 통과.
- CUA 브라우저 320×640: 가로 scrollWidth 320, 본문 16px·보조 13px 확인. 시뮬레이션 카드 x20–300, y352–493.5, 대화 제목 20px.
- CUA 브라우저 2160×3840: 대시보드 카드 마지막 하단 3407px, 안내 하단 3523px. scrollWidth 2160, scrollHeight 3840으로 예시 데이터가 잘리지 않음.
- 키보드 Enter로 일시정지·다음 장면·재개 확인. 일시정지 중 첫 장면 진행률 scaleX(0.373389)가 유지됨. 포커스 외곽선 2px 확인.
- empty 상태 AX/DOM: 네 지표 미측정, 가짜 0점 progressbar 없음. loading: 42% status/progressbar. error: alert와 운영자 요청 안내.
- 저장된 시뮬레이션 캡처의 카드 배경 표본 (490,430) RGB(59,62,69), 보조 텍스트 토큰 #e0e5ef: sRGB 대비 **8.48:1**. 이 수치는 해당 배경 표본에 한하며 모든 픽셀/프레임의 최저 대비는 아니다.
- 배경 이미지만 blur 적용. 인물 영상은 흐림 없이 기존 크로마키·가장자리 마스크 사용.

### Not verified

실제 NFC 카드 및 사용자 세션 전체 흐름, 마이크/카메라 허용과 STT/TTS, 실제 분석 서버 결과 수신, 화면 읽기 도구의 음성 출력, 실제 브라우저 200% 줌, OS reduced-motion 변경 실동작, 장문 결과의 비터치 기기 읽기 방식, 65인치 유리 패널 투과율/색 보정, 모든 영상 프레임 대비, Windows 기기 GPU/프레임률은 검증하지 않았다. 따라서 전체 전시 배포나 WCAG 적합성을 승인한 보고서가 아니다.

Lazyweb: 대화 분석 대시보드 quick search 실행, 예시 데이터 스크린샷으로 보고서 생성 요청. 작업 ID `2a9912d2-9c8c-404e-879e-1d831458745f`. 이후 pending 및 HTTP 429 응답으로 외부 보고서 URL은 아직 확보하지 못했다. 자체 QA와 별개로 외부 보고서 완료를 주장하지 않는다.

## 최종 판정

**Approve — 검토한 프런트엔드 소스와 예시 화면 범위에 한함.** 확인한 개선 항목은 반영했고 검증 가능한 테스트/빌드는 통과했다. 위 Not verified 항목은 실기기 전시 전 별도 확인이 필요하다.
