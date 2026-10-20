# 브라우저 음성인식 지연 계측 및 확정 후 대기 제거

사용자의 최종 요청에 따라 별도 앱 무음 감지, 1.2초 타이머, 강제 stop, 임시 전사 채택은 적용하지 않았다. PracticePage 마이크 파형 코드는 기존 상태 그대로다.

- Web Speech API의 speechstart, speechend, final result, 자동 제출 시각을 performance.now() 기준으로 기록한다.
- 브라우저 확정 후 기존 750ms 대기를 제거했다. React의 확정 초안 반영 이후 다음 작업에서 제출하므로 이전 초안 전송을 막는다.
- AI 재생, 일시정지, 수동 입력, 턴 전환, 언마운트 시 예약 제출을 취소한다.
- 시간 기록에는 전사 및 녹음이 없으며 페이지 메모리 window.__mirrorSpeechTimings에 최근 100개 이벤트만 남는다. 새로고침하면 사라진다.

## 실제 대화 측정 방법과 한계

개발 사이트에서 음성 대화를 하면 콘솔 [speech-latency]와 기존 분석 피드에 측정값이 나온다. 콘솔에서 console.table(window.__mirrorSpeechTimings)로 비교한다.

endToFinalMs: 브라우저 speechend 이벤트 수신부터 final 결과 수신까지의 차이. 브라우저가 발화 종료를 늦게 알릴 수 있으므로 물리적으로 입을 다문 시각부터의 전체 지연은 아니다. final이 먼저 오면 이후 speech-end 기록의 차이가 음수일 수 있으며, 이벤트 순서가 반대임을 뜻한다. 이벤트가 없으면 null이다.

finalToSubmitMs: 확정 결과부터 앱 자동 제출 콜백까지. 서버 응답 및 TTS 재생 시간은 포함하지 않는다.

실제 사용자의 육성 측정은 아직 수행되지 않았다. 브라우저 회귀 테스트는 모의 이벤트를 사용했으며 실제 마이크/인식 서버 속도 측정을 대체하지 않는다.

Web Speech API에는 무음 시간을 1.2초로 지정하는 속성이 없다. 따라서 1.2초 변경은 적용하지 않았다.
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

## 검증

모의 브라우저 테스트: 최신 초안 제출, interim 미제출, 별도 무음 종료 미발생, 브라우저 이벤트 시간 차 기록, AI 재생 중 제출 취소, 권한 오류, 네트워크 복구. 프로덕션 빌드 확인.
