import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Bulb2 } from "reicon-react/icons/Bulb2";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { ChartBarTrendUp } from "reicon-react/icons/ChartBarTrendUp";
import { Clock3 } from "reicon-react/icons/Clock3";
import { DocumentText2 } from "reicon-react/icons/DocumentText2";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { User } from "reicon-react/icons/User";
import { motion } from "framer-motion";
import { reportFits } from "../lib/reportFits";
import { FeedbackBox, Info, InfoRow, MetricBar, PageTitle, PageToolbar, Panel, PrimaryButton, ScoreRing, SecondaryButton } from "../components/report/ResultPrimitives";

export function ResultPage({ onPrev, onPractice, onNext, report, progress, error }) {
  const fits = reportFits(report);
  const total = Math.round(report?.total_score ?? 0);
  const strengths = report?.strengths || [];
  const improvements = report?.improvements || [];
  if (!report) return <section className="page result-page"><PageToolbar onPrev={onPrev} leftLabel="역할극으로 돌아가기" /><PageTitle title="AI가 대화를 분석하고 있어요" subtitle={error || `분석 중이에요 · ${progress?.pct ?? 0}%`} /><Panel className="loading-card"><span className="spinner" /><div><h3>분석 결과를 준비하고 있어요</h3><p>분석을 마치면 4-Fit 점수와 코칭을 보여드려요.</p></div></Panel></section>;

  return (
    <motion.section className="page result-page" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <PageToolbar onPrev={onPrev} leftLabel="AI 분석 결과" />
      <div className="result-report-layout">
        <Panel className="overall-card"><h2>종합 점수 <Info size={17} /></h2><div className="overall-body"><ScoreRing value={total} label={total >= 80 ? "Great" : "Good"} /><p className="score-comment">이번 대화에서 확인된 4-Fit 점수예요. 다음 연습에서 바로 바꿔볼 행동을 함께 확인해요.</p><div className="quality-list">{fits.map((fit) => <MetricBar key={fit.key} label={fit.label} value={fit.score} icon={fit.icon} tone={fit.color} suffix={fit.measured ? "/100" : "측정 제외"} />)}</div></div></Panel>
        <section className="result-main-report">
          <div className="report-heading"><div><h1>코칭 개요</h1><p>이번 연습의 핵심 요약과 맞춤 코칭 포인트입니다.</p></div><div className="report-meta"><InfoRow icon={Clock3} label="연습 시간" value={`${report.mode}분`} /><InfoRow icon={CalendarDate} label="연습 날짜" value="방금 완료" /><InfoRow icon={User} label="난이도" value={report.difficulty} /></div></div>
          <Panel className="coaching-overview"><div className="coaching-columns"><FeedbackBox tone="blue" title="잘한 점 (Strengths)" items={strengths.length ? strengths : ["답변의 핵심을 정리하려는 흐름이 잘 보였어요.", "상대에게 다음 행동을 알렸어요."]} /><FeedbackBox tone="accent" title="개선 포인트 (Areas to Improve)" items={improvements.length ? improvements : ["다음 답변에서는 결론과 기한을 먼저 말해 보세요."]} /></div></Panel>
          <Panel className="report-insight-card"><div><span className="round-icon blue"><Bulb2 size={22} /></span><div><h2>핵심 인사이트</h2><p>{report?.headline?.sentence || improvements[0] || "다음 연습에서 구체적인 근거와 기한을 한 문장으로 정리해 보세요."}</p></div></div><div className="report-radar-placeholder"><span>응답</span><b>{total}</b><span>4-Fit</span></div></Panel>
          <button className="report-detail-row" type="button" onClick={onNext}><ChartBarTrendUp size={22} /><span><b>상세 분석 보기</b><small>응답 패턴, 음성 분석, 시선 힌트와 자세 변화를 더 확인해 보세요.</small></span><ArrowRight size={20} /></button>
        </section>
      </div>
      <div className="dual-cta"><SecondaryButton icon={Refresh3} label="같은 상황 다시 연습" onClick={onPractice} /><PrimaryButton icon={DocumentText2} label="자세히 보기" onClick={onNext} /></div>
    </motion.section>
  );
}
