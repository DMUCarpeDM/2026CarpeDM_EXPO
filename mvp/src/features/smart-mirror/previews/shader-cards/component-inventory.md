# 스마트 미러용 컴포넌트 후보

2026-10-08. 공식 문서 및 설치된 shaders 4.0.2 타입 정의를 확인한 목록이다. 카드 외 후보는 아직 실제 렌더링·4K 성능을 검증하지 않았다. UI 이름은 서비스 적용 제안이며 라이브러리에서 완성 UI로 제공하는 이름이 아니다.

| 서비스 UI | 사용 가능한 효과 | 적용 방향 | 우선순위 |
| --- | --- | --- | --- |
| 출근·업무·퇴근 단계 표시 | RoundedRect, LinearGradient, Glow | 현재 단계만 밝게, 나머지는 텍스트와 선으로 표시 | 높음 |
| 자동 전환 진행 바 | RoundedRect, LinearGradient | 실제 장면 타이머와 연결한 가로 막대 | 높음 |
| 현재 장면·시간 배지 | Glass | 출근 / 09:00 같은 짧은 메타 정보의 캡슐 표면 | 높음 |
| 상대 이름·직책 라벨 | Glass 또는 BrushedMetal | 이팀장 / 팀장 등의 작은 명패; 대사보다 약한 위계 | 높음 |
| 대사 자막 패널 | Glass | HTML 텍스트 + 어두운 유리 표면; 굴절은 가장자리로 제한 | 높음 |
| 장면 이미지 후광 | RadialGradient, Glow | 투명 이미지 뒤에 낮은 밝기의 빛; 검정 배경 유지 | 높음 |
| 이미지 장면 전환 | LinearWipe | 이미지 레이어만 부드럽게 교체; 텍스트는 별도 HTML 전환 | 중간 |
| 원형 대기·남은 시간 표시 | Arc, Ring | 진행 바 대신 사용할 대안. 두 표시를 중복 배치하지 않음 | 중간 |
| 음성 입력·출력 상태 | Waveform | 실제 입력/재생 음량을 amplitude에 연결. 요약 화면에서는 생략 | 대화 화면에서 높음 |
| 세션 연결·카드 인식 상태 | Ring, Glow | 실제 연결 상태를 나타내는 작은 상태 표시와 설명 텍스트 | 중간 |
| 결과 수치·항목별 진행 표시 | Arc, Ring, RoundedRect | 실제 평가 결과로만 갱신. 보고서 화면에서 사용 | 보고서에서 중간 |
| 헤더 구분선·장면 강조선 | Beam, LinearGradient | 한 번 나타나는 짧은 빛 또는 정적인 실버 선 | 낮음 |

권장 조합: 단계 표시 + 장면 배지 + 이미지 후광 + 대사 패널 + 자동 전환 진행 바. 한 화면에 모든 효과를 넣지 않는다. 작은 배지·선·진행 바는 CSS/SVG 우선, 굴절·특수 이미지 전환이 필요한 부분만 Shader 사용을 권장한다.

버튼·탭·메뉴·모달의 동작과 접근성, 타이머·음성 분석·세션 상태는 직접 구현해야 한다. Shader는 시각 표현을 담당한다. Waveform은 기본적으로 모의 신호이므로 실제 음성 상태를 보여주려면 별도 연결이 필요하다.

미러에서는 CursorTrail/CursorRipples처럼 포인터에 의존하는 효과를 제외한다. Glitch/CRT/강한 노이즈·굴절은 현재 실버 이미지와 읽기 중심 UI에 우선 적용하지 않는다.

공식 자료:
- https://shaders.com/docs/components
- https://shaders.com/docs/components/glass
- https://shaders.com/docs/components/glow
- https://shaders.com/docs/components/transitions
- https://shaders.com/docs/components/waveform
- https://github.com/shader-effects-inc/shaders#license

라이선스: npm 엔진·효과 컴포넌트는 MIT. shaders.com의 별도 프리셋·섹션·편집기 이용 조건과 구분한다.
