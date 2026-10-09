import { ScoreRing } from "../../../components/report/ResultPrimitives";
import { Progress } from "../../../components/ui/shadcn";
import { mirrorReport } from "../lib/mirrorReport";
import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-dashboard.css";

const labels = { "Response-Fit": "응답", "Voice-Fit": "목소리", "Expression-Fit": "표정", "Posture-Fit": "자세" };

export function WorkplaceMirrorDashboard({ report, progress, error }) {
  const data = report ? mirrorReport(report) : null;
  const percent = Math.max(0, Math.min(100, Number(progress?.pct) || 0));
  return <section className="mirror-dashboard" aria-labelledby="mirror-report-title" aria-busy={!report && !error}>
    <header className="mirror-report-header"><strong>Mirror-Ting</strong><span>직장 대화 · 분석 결과</span></header>
    <div className="mirror-report-heading"><p>오늘의 대화 기록</p><h1 id="mirror-report-title">{data ? "대화를 돌아보는 시간." : error ? "분석을 완료하지 못했어요." : "대화를 분석하고 있어요."}</h1><p>{data ? "잘한 점과 다음 대화에서 바꿀 한 가지를 확인해요." : "결과가 준비되면 이 화면에 표시돼요."}</p></div>
    {!data ? <WorkplaceOverviewCard labelledBy="mirror-report-loading"><div className="mirror-report-loading" role={error ? "alert" : "status"}><h2 id="mirror-report-loading">{error || `분석 진행 ${percent}%`}</h2>{!error && <Progress value={percent} aria-label={`분석 진행률 ${percent}%`} />}</div></WorkplaceOverviewCard> : <>
      <WorkplaceOverviewCard labelledBy="mirror-score-title">
        <div className="mirror-score-summary"><div><p id="mirror-score-title">종합 점수</p><ScoreRing value={data.total} size="md" /></div><div className="mirror-score-description"><span>이번 연습</span><h2>{data.total === null ? "측정된 결과를 확인해요." : "네 가지 관점으로 살펴봤어요."}</h2><p>{data.turns !== null ? `답변 ${data.turns}개 분석` : "수집된 대화 기록 기준"}{data.audioSeconds !== null ? ` · 음성 ${data.audioSeconds}초` : ""}</p></div></div>
        <div className="mirror-fit-grid" aria-label="4개 분석 지표">{data.fits.map(fit => <article key={fit.key}>
          <div><h3>{labels[fit.key]}</h3><strong>{fit.score ?? "—"}<small>{fit.score !== null ? "/100" : ""}</small></strong></div>
          <Progress value={fit.score ?? 0} aria-label={`${labels[fit.key]} ${fit.score === null ? fit.status : `${fit.score}점`}`} />
          <p>{fit.status}</p>
        </article>)}</div>
      </WorkplaceOverviewCard>
      <WorkplaceOverviewCard labelledBy="mirror-feedback-title">
        <h2 id="mirror-feedback-title" className="mirror-panel-title">다음 대화로 가져갈 것</h2>
        <div className="mirror-feedback-grid"><div><span>01 · 잘한 점</span><p>{data.strength || "이번 분석에 잘한 점 기록이 없어요."}</p></div><div><span>02 · 바꿀 한 가지</span><p>{data.improvement || "이번 분석에 개선 제안이 없어요."}</p></div></div>
      </WorkplaceOverviewCard>
      <WorkplaceOverviewCard labelledBy="mirror-coaching-title">
        <h2 id="mirror-coaching-title" className="mirror-panel-title">이렇게 말해 보세요</h2>
        <div className="mirror-rewrite"><div><span>내 답변</span><blockquote>{data.before || "원문 기록이 없어요."}</blockquote></div><div><span>다음에는</span><blockquote>{data.after || "이번 분석에 답변 코칭이 없어요."}</blockquote></div></div>
      </WorkplaceOverviewCard>
      <footer className="mirror-report-footer">AI 분석은 연습을 위한 참고 자료예요. 미측정 항목은 점수에서 구분해 표시해요.</footer>
    </>}
  </section>;
}
