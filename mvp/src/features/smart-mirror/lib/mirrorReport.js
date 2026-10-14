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
  return `${labels} 상황의 ${area === "voice" || area === "expression" ? "관찰 기록이에요. 적합성 판정은 검증 전 참고용이에요." : "대화 맥락과 관찰 근거를 함께 반영했어요."}`;
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
      contextSummary: contextSummary(stats.context_assessments || [], fit.key),
      score: fit.measured && !(fit.key === "Voice-Fit" && stats.voice_analysis && !(contextVoice && fit.provisional)) ? mirrorScore(fit.score) : null,
      status: fit.key === "Expression-Fit" && !fit.measured && stats.expression_analysis?.samples > 0 ? "표정 출력 수집 · 검증 중" : fit.key === "Voice-Fit" && stats.voice_analysis && !(contextVoice && fit.provisional && fit.measured) ? "점수 보류" : fit.measured ? fit.provisional ? "참고 지표" : "측정 완료" : "미측정",
    })),
    strength: strengths[0] || null,
    improvement: improvements[0] || null,
    before: coaching?.quote || report.rebuild?.quote || null,
    after: coaching?.suggestion || rewrite?.sentence || rewrite?.after || rewrite?.text || null,
    turns: Number.isFinite(stats.turns) ? stats.turns : null,
    audioSeconds: Number.isFinite(stats.measurement?.audio_sec) ? Math.round(stats.measurement.audio_sec) : null,
  };
}
