import { reportFits } from "../../../lib/reportFits.js";

export function mirrorScore(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(0, Math.min(100, number))) : null;
}

export function mirrorReport(report) {
  const stats = report.speech_stats || {};
  const coaching = report.coaching?.find(item => item?.suggestion);
  const rewrite = report.rebuild?.items?.find(item => item?.sentence || item?.after || item?.text);
  return {
    total: mirrorScore(report.total_score),
    fits: reportFits(report).map(fit => ({
      ...fit,
      score: fit.measured && !(fit.key === "Voice-Fit" && stats.voice_analysis) ? mirrorScore(fit.score) : null,
      status: fit.key === "Voice-Fit" && stats.voice_analysis ? "점수 보류" : fit.measured ? fit.provisional ? "참고 지표" : "측정 완료" : "미측정",
    })),
    strength: report.strengths?.[0] || null,
    improvement: report.headline?.sentence || report.improvements?.[0] || null,
    before: coaching?.quote || report.rebuild?.quote || null,
    after: coaching?.suggestion || rewrite?.sentence || rewrite?.after || rewrite?.text || null,
    turns: Number.isFinite(stats.turns) ? stats.turns : null,
    audioSeconds: Number.isFinite(stats.measurement?.audio_sec) ? Math.round(stats.measurement.audio_sec) : null,
  };
}
