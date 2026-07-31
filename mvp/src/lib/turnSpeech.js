// 상대 발화 합성 (S-EXPR-ACK 전달 경로) — 직전 답변 리액션과 다음 질문을 한 호흡으로.
//
// 백엔드는 턴마다 reaction_text(직전 답변을 들은 인물의 반응)를 내려주지만,
// mvp는 팀장 영상 도입(2026-07-26) 때 리액션 말풍선을 걷어낸 뒤 이 대사를 쓰지
// 않고 있었다. 표정 인지 한마디(팀장이 "긴장한 표정이네요"라고 알아채는 신호)는
// 음성으로 들려야 체감되므로, TTS·자막이 이 합성 결과를 읽는다.
//
// 리액션 화자와 질문 화자가 다르면(에피소드 전환 턴) 리액션은 건너뛴다 —
// 단일 utterance·단일 보이스 구조에서 다른 인물의 대사를 같은 목소리로 읽으면
// 화자가 섞인다. 그 턴의 반응은 기존처럼 팀장 리액션 영상이 담당한다.
export function composeTurnSpeech(turn) {
  if (!turn) return "";
  const sameSpeaker = turn.reaction_character_id && turn.reaction_character_id === turn.character_id;
  const reaction = sameSpeaker ? (turn.reaction_text || "").trim() : "";
  const question = (turn.question_text || "").trim();
  return [reaction, question].filter(Boolean).join(" ");
}
