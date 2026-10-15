import { reportFits } from "../../../lib/reportFits.js";

export function mirrorScore(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(0, Math.min(100, number))) : null;
}

const contextLabels = { neutral: "일반 대화", serious: "갈등·오류 대응", supportive: "지원 요청", technical: "업무 설명", casual: "가벼운 대화" };
function contextSummary(rows, key) {
  const area = { "Response-Fit": "response", "Voice-Fit": "voice", "Expression-Fit": "expression", "Posture-Fit": "posture" }[key];
  const usable = rows.filter(row => row.context?.status === "classified" && ["observed", "review", "reference_only"].includes(row.areas?.[area]?.status));
  if (!usable.length) return "";
  const labels = [...new Set(usable.map(row => contextLabels[row.context.kind]).filter(Boolean))].join(" · ");
  return `${labels} 상황의 ${area === "voice" || area === "expression" ? "기록이에요. 좋고 나쁨을 확정하는 결과는 아니에요." : "대화 내용과 확인된 행동을 함께 살펴봤어요."}`;
}

function voiceSummary(data) {
  const turns = data?.turns || [];
  const speeds = turns.filter(t => t.speed?.status === "measured" && Number.isFinite(t.speed.syllables_per_second));
  const pauses = turns.filter(t => t.pauses?.status === "measured");
  const parts = [];
  if (speeds.length) parts.push(`말할 때 1초에 한글 약 ${(speeds.reduce((sum, t) => sum + t.speed.syllables_per_second, 0) / speeds.length).toFixed(1)}글자를 말했어요.`);
  if (pauses.length) parts.push(`쉬어 간 구간은 총 ${pauses.reduce((sum, t) => sum + (t.pauses.count || 0), 0)}번이에요.`);
  return parts.length ? parts.join(" ") + "" : "목소리를 확인할 녹음이 충분하지 않아 이번에는 평가하지 않았어요.";
}

const technicalCopy = /기준점|75점|가감|유효.*표본|원시|sigmoid|logits|engine_version|calibration|relative_db|측정 불가 사유|[A-Za-z_]+=[0-9]|판단할 측정 자료/i;
function feedbackText(text) {
  return text.replace("자신의 공개 범위와 의사를 표현하고 상대의 말에 관련 있게 대응한다. 공개·거절 모두 인정한다. 내용을 답변에 담았습니다.", "말하고 싶은 범위와 자신의 의사를 표현하며 상대의 질문에 맞게 답했어요.")
    .replace("질문에 직접 답하는 내용을 담았습니다.", "상대의 질문에 직접 답했어요.");
}
function readableFit(fit, stats) {
  if (fit.key === "Voice-Fit" && stats.voice_analysis) return voiceSummary(stats.voice_analysis);
  if (fit.key === "Expression-Fit" && !fit.measured) return stats.expression_analysis?.samples > 0 ? "표정 기록은 모았지만 아직 점수로 평가하지 않았어요." : "얼굴이 충분히 보이는 기록이 없어 이번에는 표정을 평가하지 않았어요.";
  if (fit.key === "Posture-Fit" && !fit.measured) return "몸의 움직임을 확인할 기록이 부족해 이번에는 자세를 평가하지 않았어요.";
  if (!technicalCopy.test(fit.text)) return fit.text;
  return { "Response-Fit": "질문에 맞게 답하고 자신의 의사를 분명히 전달했는지 살펴봤어요.", "Voice-Fit": "녹음에서 말하는 속도와 쉬어 가는 구간을 살펴봤어요.", "Expression-Fit": "확인된 얼굴 기록을 살펴봤어요. 표정 결과는 참고용이에요.", "Posture-Fit": "확인된 몸의 움직임과 자세를 살펴봤어요." }[fit.key];
}

export function mirrorReport(report) {
  const stats = report.speech_stats || {};
  const contextVoice = ["context_provisional", "measurement_provisional"].includes(stats.voice_analysis?.score_status);
  const coaching = report.coaching?.find(item => item?.suggestion);
  const rewrite = report.rebuild?.items?.find(item => item?.sentence || item?.after || item?.text);
  const strengths = (report.strengths || []).filter(item => typeof item === "string" && item.trim()).map(feedbackText);
  const improvements = (report.improvements || []).filter(item => typeof item === "string" && item.trim()).map(feedbackText);
  return {
    strengths,
    improvements,
    voiceAnalysis: stats.voice_analysis || null,
    total: mirrorScore(report.total_score),
    fits: reportFits(report).map(fit => ({
      ...fit,
      text: readableFit(fit, stats),
      contextSummary: contextSummary(stats.context_assessments || [], fit.key),
      score: fit.measured && !(fit.key === "Voice-Fit" && stats.voice_analysis && !(contextVoice && fit.provisional)) ? mirrorScore(fit.score) : null,
      status: fit.key === "Expression-Fit" && !fit.measured && stats.expression_analysis?.samples > 0 ? "표정 기록 확인 중" : fit.key === "Voice-Fit" && stats.voice_analysis && !(contextVoice && fit.provisional && fit.measured) ? "점수 없이 기록만 제공" : fit.measured ? fit.provisional ? "참고용 결과" : "측정 완료" : "기록 부족",
    })),
    strength: strengths[0] || null,
    improvement: improvements[0] || null,
    before: coaching?.quote || report.rebuild?.quote || null,
    after: coaching?.suggestion || rewrite?.sentence || rewrite?.after || rewrite?.text || null,
    turns: Number.isFinite(stats.turns) ? stats.turns : null,
    audioSeconds: Number.isFinite(stats.measurement?.audio_sec) ? Math.round(stats.measurement.audio_sec) : null,
  };
}
