import { useEffect, useRef, useState } from "react";
import { ScoreRing } from "../../../components/report/ResultPrimitives";
import { mirrorReport } from "../lib/mirrorReport";
import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-dashboard.css";

const analysisStages = {
  queued: "분석을 준비하고 있어요", stt: "음성 기록을 확인하고 있어요",
  response: "대화 내용을 살펴보고 있어요", voice: "목소리를 분석하고 있어요",
  nonverbal: "표정과 자세를 확인하고 있어요", scoring: "분석 점수를 정리하고 있어요",
  report: "잘한 점과 개선점을 정리하고 있어요", done: "결과를 불러오고 있어요",
};

const labels = { "Response-Fit": "응답", "Voice-Fit": "목소리", "Expression-Fit": "표정", "Posture-Fit": "자세" };

function AnalysisProgress({ percent, label }) {
  const [displayed, setDisplayed] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame;
    const update = value => { current.current = value; setDisplayed(value); };
    const settle = () => {
      if (motion.matches) { cancelAnimationFrame(frame); update(percent); }
    };
    if (motion.matches || percent < current.current) {
      update(percent);
    } else {
      const from = current.current;
      const started = performance.now();
      const tick = now => {
        const elapsed = Math.min(1, (now - started) / 600);
        update(from + (percent - from) * (1 - Math.pow(1 - elapsed, 3)));
        if (elapsed < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    motion.addEventListener("change", settle);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener("change", settle); };
  }, [percent]);
  return <>
    <div className="mirror-analysis-caption"><h2 id="mirror-report-loading">{label}</h2><span className="mirror-analysis-percent" aria-hidden="true">{Math.floor(displayed)}<small>%</small></span></div>
    <div className="mirror-analysis-track" role="progressbar" aria-label="대화 분석 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${label}, ${percent}%`}><div className="mirror-analysis-fill" style={{ transform: `scaleX(${displayed / 100})` }} /></div>
  </>;
}

export function WorkplaceMirrorDashboard({ report, progress, error }) {
  const data = report ? mirrorReport(report) : null;
  const percent = Math.max(0, Math.min(100, Number(progress?.pct) || 0));
  const stageLabel = analysisStages[progress?.stage] || "대화 기록을 분석하고 있어요";
  return <section className="mirror-dashboard" aria-labelledby="mirror-report-title">
    <header className="mirror-report-header"><strong>Mirror-Ting</strong><span>직장 대화 · 분석 결과</span></header>
    <div className="mirror-report-heading"><p>오늘의 대화 기록</p><h1 id="mirror-report-title">{data ? "대화를 돌아보는 시간." : error ? "분석을 완료하지 못했어요." : "대화를 분석하고 있어요."}</h1><p>{data ? "잘한 점과 다음 대화에서 개선할 점을 확인해요." : error ? "운영자에게 분석 결과를 다시 불러와 달라고 요청해 주세요." : "결과가 준비되면 이 화면에 표시돼요."}</p></div>
    {!data ? <WorkplaceOverviewCard labelledBy="mirror-report-loading"><div className="mirror-report-loading" role={error ? "alert" : "status"}>{error ? <h2 id="mirror-report-loading">{error}</h2> : <AnalysisProgress percent={percent} label={stageLabel} /> }</div></WorkplaceOverviewCard> : <>
      <WorkplaceOverviewCard labelledBy="mirror-score-title">
        <div className="mirror-score-summary"><div><p id="mirror-score-title">종합 점수</p><ScoreRing value={data.total} size="md" /></div><div className="mirror-score-description"><span>이번 연습</span><h2>{data.total === null ? "측정된 결과를 확인해요." : "측정된 항목으로 계산했어요."}</h2><p>{data.turns !== null ? `답변 ${data.turns}개 분석` : "수집된 대화 기록 기준"}{data.audioSeconds !== null ? ` · 음성 ${data.audioSeconds}초` : ""}</p></div></div>
        <div className="mirror-fit-grid" aria-label="4개 분석 지표">{data.fits.map(fit => <article key={fit.key}>
          <div><h3>{labels[fit.key]}</h3><strong>{fit.score ?? "—"}<small>{fit.score !== null ? "/100" : ""}</small></strong></div>
          <p className="mirror-fit-explanation">{fit.text}</p>
        </article>)}</div>
      </WorkplaceOverviewCard>
      <WorkplaceOverviewCard labelledBy="mirror-feedback-title">
        <h2 id="mirror-feedback-title" className="mirror-panel-title">다음 대화에서 기억할 점</h2>
        <div className="mirror-feedback-grid"><div><span>01 · 잘한 점</span>{data.strengths.length ? data.strengths.map((text, i) => <p key={i}>{text}</p>) : <p>확인된 잘한 점 기록이 없어요.</p>}</div><div><span>02 · 개선할 점</span>{data.improvements.length ? data.improvements.map((text, i) => <p key={i}>{text}</p>) : <p>확인된 개선 제안이 없어요.</p>}</div></div>
      </WorkplaceOverviewCard>
      {<WorkplaceOverviewCard labelledBy="mirror-coaching-title">
        <h2 id="mirror-coaching-title" className="mirror-panel-title">이렇게 말해 보세요</h2>
        <div className="mirror-rewrite"><div><span>내 답변</span><blockquote>{data.before || "이번 결과에는 답변 원문이 저장되지 않았어요."}</blockquote></div><div><span>다음에는</span><blockquote>{data.after || "이번 결과에는 별도의 답변 제안이 없어요."}</blockquote></div></div>
      </WorkplaceOverviewCard>}

      <footer className="mirror-report-footer">AI 분석은 연습을 위한 참고 자료예요. 미측정 항목은 점수에서 구분해 표시해요.</footer>
    </>}
  </section>;
}
