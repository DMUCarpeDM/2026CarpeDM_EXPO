# 음성 및 시뮬레이션 검증

- 실제 Gemini 가상 대화 2건: 제공자 원문과 전달 문자열 일치. 각 1회 호출, 7.41초 / 6.85초.
- Iris 실행 전 새 문장 합성 503 재현. 런타임 시작 후 같은 AI 대사 HTTP 200, 336044바이트, WAV 7초, 합성 5.98초.
- 실제 production WorkplaceMirrorSceneSimulation + startTurnSpeech를 테스트 화면에서 실행: waiting → playing → ended. 실제 AI 대사의 문장별 자막 확인, 종료 시 data-visible=false. 테스트 화면은 검증 후 삭제.
- 사용자 세션 DOM: leaving/listening.mp4 재생 확인. 참고 점수/심각한 대화/검증 전 안내 제거 확인.
- 내장 브라우저 SpeechRecognition network 오류 반복 재현. 1/2/4초 재시도 후 중단하도록 수정. 안내 문구를 클릭하거나 키보드로 활성화하면 재시도.
- 실제 hook을 사용하는 브라우저 fixture에서 인식기 시작 횟수 1→2→3→4 확인. 네 번째 오류에서 off, 수동 재시도 시 5 및 listening=true, 합성 인식 결과 '복구 후 답변' 보존 확인.
- 프론트엔드 음성/API 단위 테스트 33개 통과. Vite production build 통과.
- 한계: Chrome 테스트 탭은 카메라/마이크 권한 대기. 실제 사용자 발화→AI 다음 턴 전체 경로 검증은 완료하지 못함. 내장 브라우저의 지속적인 네트워크 실패를 해결했다고 주장하지 않음.
