export function practiceInputStatus({ busy, entryOverlayOpen, paused, turn, aiSpeaking, textOnly, sttMode, micEnabled, hasMicrophone, listening }) {
  if (busy) return { title: "답변 처리 중", hint: "AI 응답을 기다려 주세요." };
  if (entryOverlayOpen) return { title: "연습 준비 중", hint: "화면의 준비 안내를 먼저 확인해 주세요." };
  if (paused) return { title: "진행 일시정지", hint: "계속하려면 상단의 ‘연습 재개’를 선택해 주세요." };
  if (!turn) return { title: "질문 대기 중", hint: "질문이 표시되면 답변할 수 있어요." };
  if (aiSpeaking) return { title: "AI 질문 듣는 중", hint: "질문을 듣고 답변을 준비해 주세요." };
  if (textOnly || sttMode === "off" || !micEnabled || !hasMicrophone) return { title: "직접 입력", hint: "답변을 입력한 뒤 ‘전송’을 눌러 주세요." };
  if (listening) return { title: "음성 인식 중", hint: "답변이 글자로 표시돼요. 말이 끝나면 약 3초 뒤 자동 전송돼요." };
  return { title: "음성 인식 대기", hint: "인식이 시작되지 않으면 답변을 직접 입력할 수 있어요." };
}
