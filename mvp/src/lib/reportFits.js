const fitPresentation = [
  ["Response-Fit", "Response", "response", "response"],
  ["Voice-Fit", "Voice", "voice", "voice"],
  ["Eye-Fit", "Eye", "eye", "eye"],
  ["Posture-Fit", "Posture", "posture", "posture"],
];

function fitScore(item) {
  const rawScore = typeof item === "object" && item !== null ? item.score : item;
  const parsedScore = typeof rawScore === "string" ? Number(rawScore) : rawScore;
  return Number.isFinite(parsedScore) ? Math.round(parsedScore) : null;
}

export function scoreFromFit(item) {
  return fitScore(item) ?? 0;
}

function fitSource(report, key, label) {
  const shortKey = key.replace("-Fit", "").toLowerCase();
  return report?.fit_scores?.[key]
    ?? report?.fit_scores?.[shortKey]
    ?? report?.fit_scores?.[label]
    ?? report?.[shortKey]
    ?? null;
}

export function reportFits(report) {
  return fitPresentation.map(([key, label, color, icon]) => {
    const item = fitSource(report, key, label);
    const score = fitScore(item);
    const measured = score !== null;
    const fitLabel = typeof item === "object" && item !== null && item.label ? item.label : label;
    const text = typeof item === "object" && item !== null
      ? item.summary || item.comment || item.feedback || "이번 연습에서는 측정되지 않았어요."
      : "이번 연습에서는 측정되지 않았어요.";
    return {
      key,
      label: fitLabel,
      color,
      icon,
      score: measured ? score : 0,
      measured,
      grade: measured ? (score >= 80 ? "GREAT" : score >= 60 ? "GOOD" : "TRY") : "N/A",
      text,
    };
  });
}
