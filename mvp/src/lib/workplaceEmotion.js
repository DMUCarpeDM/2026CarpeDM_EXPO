/** 직장대화 AI 대사·턴 신호 → CounterpartVideo 감정 클립 키.
 *  빈 문자열이면 기본말하기(speaking/listening)로 둔다. */

const CASE_TO_EMOTION = Object.freeze({
  excellent: "joy",
  covered: "joy",
  missing: "disappointment",
  short: "irritation",
  risky: "anger",
});

const JOY_RE = /기쁘|좋(아|네|아요|겠다)|훌륭|잘\s*(했|하|됐)|고마|수고|든든|괜찮(아|네|아요)|오,/;
const DISAPPOINTMENT_RE = /실망|아쉽|기대했|그렇지\s*않|아쉽게/;
const IRRITATION_RE = /짜증|답답|왜\s*그래|자꾸|좀\s*아니|재촉/;
const ANGER_RE = /화나|화가|심각|문제예요|안\s*돼|장난|지금\s*그\s*말/;

/** 대사 문장만으로 감정 클립을 고른다. */
export function pickWorkplaceLineEmotion(text = "") {
  const line = String(text || "");
  if (!line) return "";
  if (JOY_RE.test(line)) return "joy";
  if (DISAPPOINTMENT_RE.test(line)) return "disappointment";
  if (IRRITATION_RE.test(line)) return "irritation";
  if (ANGER_RE.test(line)) return "anger";
  return "";
}

/** 턴 평가 신호(case·emotion) 우선, 없으면 대사 키워드. */
export function pickWorkplaceEmotion({ text = "", turnSignals = null } = {}) {
  const fromCase = turnSignals?.case && CASE_TO_EMOTION[turnSignals.case];
  if (fromCase) return fromCase;

  const mood = turnSignals?.emotion?.state;
  if (mood === "agitated") return "anger";
  if (mood === "displeased") return "irritation";

  return pickWorkplaceLineEmotion(text);
}
