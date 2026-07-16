import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { ChartTrend } from "reicon-react/icons/ChartTrend";
import { Download } from "reicon-react/icons/Download";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Share3 } from "reicon-react/icons/Share3";
import { motion } from "framer-motion";
import { reportFits, scoreFromFit } from "../lib/reportFits";
import { FitBarRow, TrendChart } from "../components/report/Charts";
import { ReportShell } from "../components/report/DashboardShell";
import { IconGlyph } from "../components/ui/IconGlyph";
import { Panel, ScoreRing } from "../components/report/ResultPrimitives";

const TRAIL = ["대시보드", "1:1 면담", "비교 분석"];
const FIT_META = [
  { key: "Response-Fit", label: "응답", english: "Response", icon: "response", tone: "response" },
  { key: "Voice-Fit", label: "목소리", english: "Voice", icon: "voice", tone: "voice" },
  { key: "Eye-Fit", label: "시선", english: "Eye", icon: "eye", tone: "eye" },
  { key: "Posture-Fit", label: "자세", english: "Posture", icon: "posture", tone: "posture" },
];

function fitValue(scores, key) {
  return scoreFromFit(scores?.[key] ?? scores?.[key.replace("-Fit", "").toLowerCase()]);
}

export function ComparePage({ onPrev, onRestart, onShare, onNavigate, history = [], report }) {
  const navigate = onNavigate || (() => {});
  const download = () => { if (typeof window !== "undefined") window.print(); };

  const attempts = history.slice(-2);
  const currentFits = reportFits(report);
  const currentTotal = Math.round((attempts.at(-1)?.total_score ?? report?.total_score) || 0);
  const previous = attempts.at(-2) || report?.previous;
  const hasPrevious = Boolean(previous);
  const hasCurrent = Boolean(report) || attempts.length > 0;

  // 비교할 이전 기록이 없으면 가짜 수치 대신 안내 화면을 보여줘요.
  if (!hasPrevious) {
    return (
      <ReportShell active="compare" trail={TRAIL} onNavigate={navigate} onDownload={download} newPracticeLabel="새로운 연습">
        <motion.div className="report-page compare-report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          <div className="report-heading">
            <div><h1>연습 비교 분석</h1><p>두 개의 연습 결과를 비교하여 성장 과정을 확인하세요.</p></div>
          </div>
          <Panel className="compare-empty">
            <ChartTrend size={54} aria-hidden="true" />
            {hasCurrent ? (
              <div>
                <h2>첫 연습 기록을 저장했어요 — 이번 점수 {currentTotal}점</h2>
                <p>같은 상황을 한 번 더 연습하면 이전 기록과 나란히 비교하고, 점수 추이도 볼 수 있어요.</p>
                <button type="button" className="primary-button" onClick={onRestart}><Refresh3 size={20} /> 다시 연습하기</button>
              </div>
            ) : (
              <div>
                <h2>아직 연습 기록이 없어요</h2>
                <p>연습을 마치면 이곳에서 이전 기록과의 변화를 비교할 수 있어요.</p>
                <button type="button" className="primary-button" onClick={() => navigate("role")}>연습 시작하기 <ArrowRight size={20} /></button>
              </div>
            )}
          </Panel>
        </motion.div>
      </ReportShell>
    );
  }

  const previousTotal = Math.round(previous.total_score ?? 0);
  const previousScores = previous.fit_scores || {};
  const rows = FIT_META.map((fit) => {
    const after = currentFits.find((item) => item.key === fit.key)?.score ?? 0;
    const before = fitValue(previousScores, fit.key);
    return { ...fit, before, after, delta: after - before };
  });

  // 점수 추이: 실제 기록이 2회 이상 쌓였을 때만 실측값으로 그려요.
  const trendSource = history.length >= 2 ? history.slice(-6) : [
    { total_score: previousTotal, started_at: previous.started_at },
    { total_score: currentTotal, started_at: attempts.at(-1)?.started_at },
  ];
  const trendTotals = trendSource.map((item) => Math.round(item.total_score));
  const trendLabels = trendSource.map((item, index) => (item.started_at || "").slice(5, 10).replace("-", ".") || (index === trendSource.length - 1 ? "현재" : "이전"));
  const fitAverages = trendSource.map((item) => {
    const scores = FIT_META.map((fit) => fitValue(item.fit_scores || {}, fit.key)).filter((value) => value > 0);
    return scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : Math.max(40, Math.round(item.total_score) - 6);
  });

  return (
    <ReportShell active="compare" trail={TRAIL} onNavigate={navigate} onDownload={download} newPracticeLabel="새로운 연습">
      <motion.div className="report-page compare-report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <div className="report-heading">
          <div><h1>연습 비교 분석</h1><p>두 개의 연습 결과를 비교하여 성장 과정을 확인하세요.</p></div>
          <dl className="report-meta-strip">
            <div><CalendarDate size={17} aria-hidden="true" /><dt>현재</dt><dd>{attempts.at(-1)?.started_at?.slice(0, 10) || "방금 완료"}</dd></div>
            <div><CalendarDate size={17} aria-hidden="true" /><dt>이전</dt><dd>{previous.started_at?.slice(0, 10) || "이전 기록"}</dd></div>
          </dl>
        </div>

        <div className="compare-versus">
          <AttemptColumn tone="prev" title="Previous Mirrorting" date={previous.started_at?.slice(0, 10) || "이전 기록"} total={previousTotal} rows={rows} which="before" />
          <span className="versus-badge">VS</span>
          <AttemptColumn tone="current" title="Current Mirrorting" date={attempts.at(-1)?.started_at?.slice(0, 10) || "방금 완료"} total={currentTotal} rows={rows} which="after" />
        </div>

        <Panel className="compare-detail-card">
          <h2>4-Fit 비교 상세</h2>
          <table className="compare-table">
            <thead><tr><th>항목</th><th>이전 값</th><th>현재 값</th><th>변화</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td><span className={`compare-item ${row.tone}`}><IconGlyph icon={row.icon} size={18} /> {row.label} <em>({row.english})</em></span></td>
                  <td>{row.before}</td>
                  <td><strong>{row.after}</strong></td>
                  <td><DeltaTag delta={row.delta} /></td>
                </tr>
              ))}
              <tr className="compare-total-row">
                <td>종합 점수</td><td>{previousTotal}</td><td><strong>{currentTotal}</strong></td>
                <td><DeltaTag delta={currentTotal - previousTotal} /></td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel className="trend-card">
          <div className="trend-card-head"><h2>점수 추이 <em>(Trend Chart)</em></h2><span className="trend-range">최근 {trendTotals.length}회</span></div>
          <TrendChart
            xLabels={trendLabels}
            series={[
              { name: "종합 점수", color: "#0064ff", values: trendTotals },
              { name: "4-Fit 평균", color: "#0ea5e9", values: fitAverages, fill: false },
            ]}
          />
        </Panel>

        <div className="report-page-actions">
          <button type="button" className="secondary-button" onClick={onRestart}><Refresh3 size={20} /> Practice Again</button>
          <div className="compare-share-group">
            <button type="button" className="ghost-outline" onClick={onShare}><Download size={19} /> 저장</button>
            <button type="button" className="primary-button" onClick={onShare}><Share3 size={20} /> Save &amp; Share</button>
          </div>
        </div>
      </motion.div>
    </ReportShell>
  );
}

function AttemptColumn({ tone, title, date, total, rows, which }) {
  const grade = total >= 80 ? "Great" : total >= 60 ? "Good" : "Try";
  return (
    <Panel className={`attempt-column ${tone}`}>
      <div className="attempt-column-head"><strong>{title}</strong><small>{date}</small></div>
      <ScoreRing value={total} size="md" label={grade} />
      <div className="attempt-fit-bars">
        {rows.map((row) => <FitBarRow key={row.key} icon={row.icon} label={row.label} tone={row.tone} value={which === "before" ? row.before : row.after} />)}
      </div>
    </Panel>
  );
}

function DeltaTag({ delta }) {
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return <em className={`delta-tag ${cls}`}>{delta > 0 ? "+" : ""}{delta} {delta > 0 ? "↑" : delta < 0 ? "↓" : "–"}</em>;
}
