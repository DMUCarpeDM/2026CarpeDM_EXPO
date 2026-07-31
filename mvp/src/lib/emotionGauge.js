// 감정 온도 게이지 표시 로직 (S-B2B-EMOTION) — 서버 감정 상태 머신의 순수 표시 매핑.
// turn_signals.emotion 계약: {} 또는
//   {state: "calm"|"displeased"|"agitated", label: "평온"|"불만"|"격앙", temperature: 0~100, eased: boolean}
// 빈 dict는 감정 프로파일이 없는 시나리오(기존 클라우드밋 전시 흐름) — 게이지를 렌더하지 않는다.

const STATE_LABELS = { calm: "평온", displeased: "불만", agitated: "격앙" };

// 색 매핑 — 평온=초록(크림 계열 트랙 위), 불만=웜 오렌지(카페 온도 포인트), 격앙=빨강.
const STATE_PALETTE = {
  calm: { color: "#2f9e63", soft: "rgba(94, 234, 148, 0.18)" },
  displeased: { color: "#e8833a", soft: "rgba(232, 131, 58, 0.2)" },
  agitated: { color: "#e0442e", soft: "rgba(224, 68, 46, 0.22)" },
};

// 게이지 렌더에 필요한 모든 값을 계산한다. 렌더 불가(빈 emotion·미지원 상태)면 null.
export function emotionVisual(emotion) {
  if (!emotion || typeof emotion !== "object") return null;
  const palette = STATE_PALETTE[emotion.state];
  if (!palette) return null;
  const temperature = Number(emotion.temperature);
  const pct = Number.isFinite(temperature) ? Math.max(0, Math.min(100, temperature)) : 0;
  return {
    state: emotion.state,
    label: emotion.label || STATE_LABELS[emotion.state],
    pct,
    color: palette.color,
    soft: palette.soft,
    eased: Boolean(emotion.eased),
  };
}
