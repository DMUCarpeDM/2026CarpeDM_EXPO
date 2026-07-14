import { Download } from "reicon-react/icons/Download";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Share3 } from "reicon-react/icons/Share3";
import { Star } from "reicon-react/icons/Star";
import { ChartTrend } from "reicon-react/icons/ChartTrend";
import { motion } from "framer-motion";
import { reportFits, scoreFromFit } from "../lib/reportFits";
import { AttemptCard, CompareRow, HistoryPoint, ImprovedPoint, PageTitle, PageToolbar, Panel, PrimaryButton, SecondaryButton } from "../components/report/ResultPrimitives";

export function ComparePage({ onPrev, onRestart, onShare, history, report }) {
  const attempts = history.slice(-2);
  const current = attempts.at(-1) || { total_score: report?.total_score || 0, started_at: "현재" };
  const previous = attempts.at(-2) || report?.previous;
  const currentFits = reportFits(report);
  const previousFits = previous?.fit_scores || {};
  return <motion.section className="page compare-page" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
    <PageToolbar onPrev={onPrev} leftLabel="이전 단계로 돌아가기" />
    <PageTitle title={<>다시 연습한 결과를 <em>비교해요</em></>} subtitle="두 번의 연습 결과를 비교하고, 더 나은 커뮤니케이션으로 성장해보세요." />
    <div className="attempt-grid">{previous ? <AttemptCard title="이전 시도" date={previous.started_at?.slice(0, 10) || "이전 기록"} score={Math.round(previous.total_score)} color="sky" text="이전에 연습한 분석 결과예요." /> : <Panel><p>같은 기기에서 한 번 더 연습하면 이전 기록과 비교할 수 있어요.</p></Panel>}<AttemptCard selected title="현재 시도" date={current.started_at?.slice(0, 10) || "현재"} score={Math.round(current.total_score)} color="blue" text="이번에 연습한 분석 결과예요." /></div>
    {previous ? <ComparisonContent current={current} previous={previous} currentFits={currentFits} previousFits={previousFits} history={history} onRestart={onRestart} onShare={onShare} /> : <FirstAttempt onRestart={onRestart} />}
  </motion.section>;
}

function ComparisonContent({ current, previous, currentFits, previousFits, history, onRestart, onShare }) {
  return <><div className="compare-grid"><Panel className="comparison-table"><h2>영역별 점수 비교</h2>{currentFits.filter((fit) => fit.measured !== false).map((fit) => <CompareRow key={fit.key} label={fit.label} text="4-Fit 기준으로 분석한 결과예요" before={scoreFromFit(previousFits[fit.key] ?? previousFits[fit.key.replace("-Fit", "").toLowerCase()])} after={fit.score} icon={fit.icon} />)}</Panel><Panel className="improved-card"><h2><Star size={22} /> 이번 연습에서 좋아진 점</h2>{currentFits.filter((fit) => fit.measured !== false).map((fit) => <ImprovedPoint key={fit.key} icon={fit.icon} title={`${fit.label} ${fit.score}점`} text={fit.text} />)}</Panel></div><div className="history-grid"><Panel className="history-card"><h2>연습 히스토리</h2><div className="history-line">{history.map((item, index) => <HistoryPoint key={item.session_id} label={`${index + 1}번째 시도`} score={`${Math.round(item.total_score)}점`} date={item.started_at?.slice(0, 10)} active={item.session_id === current.session_id} />)}</div></Panel><Panel className="growth-card"><ChartTrend size={54} /><div><h2>꾸준한 연습이 실력을 만들어요</h2><p>{Math.round(current.total_score - previous.total_score)}점 변화가 기록됐어요. 계속 연습하며 더 높은 점수를 달성해보세요.</p></div></Panel><Panel className="compare-actions"><PrimaryButton icon={Refresh3} label="다시 연습하기" onClick={onRestart} wide /><div><SecondaryButton icon={Download} label="결과 저장" onClick={onShare} /><SecondaryButton icon={Share3} label="공유하기" onClick={onShare} /></div></Panel></div></>;
}

function FirstAttempt({ onRestart }) {
  return <Panel className="growth-card"><ChartTrend size={54} /><div><h2>첫 연습 기록을 저장했어요</h2><p>한 번 더 연습하면 4-Fit 결과를 이전 시도와 비교할 수 있어요.</p><PrimaryButton icon={Refresh3} label="다시 연습하기" onClick={onRestart} /></div></Panel>;
}
