# TTS 자막 모션 구현 및 검토

카드 없는 문장별 배치는 유지합니다. TTS 생성 중에는 숨기고 실제 재생 시작에 첫 문장을 표시합니다. 현재 문장은 흰색, 지난 문장은 45% 불투명도로 표시하며 다음 문장은 차례가 올 때 나타납니다. 정상 발화 종료 즉시 240ms 페이드아웃합니다. 일시정지·취소·턴 교체에도 이전 진행을 정리합니다. 음성 재생 불가 시에는 전체 텍스트를 남깁니다.

Iris API는 오디오만 반환하므로 문장 경계는 currentTime/duration과 문자 비율로 추정합니다. 실제 강제 정렬 타임스탬프가 아니며 문장 사이 침묵이나 발화 속도 변화에 따라 강조가 어긋날 수 있습니다. 시작과 종료는 실제 오디오 이벤트입니다. 브라우저 TTS는 boundary 이벤트를 우선하고, 이벤트가 없을 때 약 7자/초로 추정합니다.

## review-animations 검토

| Before | After | Why |
| --- | --- | --- |
| 생성 대기부터 자막 표시, 종료 뒤 최소 6초 대기 | 실제 playing/ended 이벤트 연결 (`mvp/src/lib/turnSpeechPlayback.js:16`, `:94`) | 소리와 화면 상태 일치 |
| 첫 문장만 흰색 고정 | 문장 진행에 따라 active/past/upcoming 전환 (`mvp/src/features/smart-mirror/components/MirrorSubtitles.jsx:8`) | 읽는 문장에 시선 유도 |
| 500ms 기본 ease 페이드 | 진입 160ms·문장 180ms·종료 240ms, cubic-bezier(0.23,1,0.32,1) (`mvp/src/features/smart-mirror/styles/workplace-mirror-simulation.css:16`) | STANDARDS.md의 300ms 미만·strong ease-out 준수 |
| 모션 감소에서 전환 전부 제거 | 이동 없이 120ms opacity 전환 (`mvp/src/features/smart-mirror/styles/workplace-mirror-simulation.css:54`) | 상태 전달은 유지하면서 움직임 감소 |

성능: opacity/transform만 전환하며 레이아웃 속성·색상 애니메이션·transition:all을 사용하지 않습니다. CSS transition으로 중단/재타기팅합니다. 전체 타이핑 효과나 반복 장식을 추가하지 않았습니다.

판정: **Approve** — 모션 구현의 타이밍·성능·중단 가능성·접근성 기준을 충족합니다. Iris 문장 경계의 정확한 음성 정렬은 별도 한계입니다.

검증: production 빌드 성공, 음성 재생/취소/대체 경로 및 문장 분리 단위 검사 10개 통과. 합성 카메라·모의 TTS 이벤트로 1080×1920 / 390×844에서 생성 대기 숨김, 문장별 포커스 이동, 종료 페이드, 겹침 없음, 페이지 오류 없음, 모션 감소의 transform 제거를 검증했습니다. 실제 Iris 음성을 청취한 정렬 정확도 검증은 포함하지 않습니다.

캡처: `.omo/evidence/selected-simulation-layout/1080.png`, `1080-second-sentence.png`, `390.png`, `390-second-sentence.png`.
