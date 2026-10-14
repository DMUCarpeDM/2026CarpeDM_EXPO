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

export function mirrorReport(report) {
  const stats = report.speech_stats || {};
  const contextVoice = stats.voice_analysis?.score_status === "context_provisional";
  const coaching = report.coaching?.find(item => item?.suggestion);
  const rewrite = report.rebuild?.items?.find(item => item?.sentence || item?.after || item?.text);
  const strengths = (report.strengths || []).filter(item => typeof item === "string" && item.trim());
  const improvements = (report.improvements || []).filter(item => typeof item === "string" && item.trim());
  return {
    strengths,
    improvements,
    voiceAnalysis: stats.voice_analysis || null,
    total: mirrorScore(report.total_score),
    fits: reportFits(report).map(fit => ({
      ...fit,
      text: fit.key === "Voice-Fit" && stats.voice_analysis ? "말속도와 쉬어 간 구간은 아래에서 확인해요. 목소리는 점수보다 기록을 중심으로 살펴봐 주세요." : fit.key === "Expression-Fit" && !fit.measured ? (stats.expression_analysis?.samples > 0 ? "표정 기록은 모았지만 아직 점수로 평가하지 않았어요." : "얼굴이 충분히 보이는 기록이 없어 이번에는 표정을 평가하지 않았어요.") : fit.key === "Posture-Fit" && !fit.measured ? "몸의 움직임을 확인할 기록이 부족해 이번에는 자세를 평가하지 않았어요." : fit.key === "Response-Fit" && /75점에서.*가감/.test(fit.text) ? "질문에 맞게 답했는지, 자신의 의사를 분명히 전달했는지 살펴봤어요. 구체적인 내용은 아래 잘한 점과 개선점을 확인해 주세요." : fit.text,
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
