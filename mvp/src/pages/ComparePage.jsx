import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { Download } from "reicon-react/icons/Download";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Share3 } from "reicon-react/icons/Share3";
import { motion } from "framer-motion";
import { reportFits, scoreFromFit } from "../lib/reportFits";
import { FitBarRow, TrendChart } from "../components/report/Charts";
import { IconGlyph } from "../components/ui/IconGlyph";
import { PageToolbar, Panel, ScoreRing } from "../components/report/ResultPrimitives";

const FIT_META = [
  { key: "Response-Fit", label: "응답", english: "Response", icon: "response", tone: "response" },
  { key: "Voice-Fit", label: "목소리", english: "Voice", icon: "voice", tone: "voice" },
  { key: "Eye-Fit", label: "시선", english: "Eye", icon: "eye", tone: "eye" },
  { key: "Posture-Fit", label: "자세", english: "Posture", icon: "posture", tone: "posture" },
];

function fitValue(scores, key) {
  return scoreFromFit(scores?.[key] ?? scores?.[key.replace("-Fit", "").toLowerCase()]);
}

export function ComparePage({ onPrev, onRestart, onShare, history = [], report }) {

  const attempts = history.slice(-2);
  const currentFits = reportFits(report);
  const currentTotal = Math.round((attempts.at(-1)?.total_score ?? report?.total_score) || 0);
  const previous = attempts.at(-2) || report?.previous;
  const hasPrevious = Boolean(previous);
  const previousTotal = Math.round(previous?.total_score ?? 0);
  const previousScores = previous?.fit_scores || {};

  // 비교 표/추이 데이터. 이전 기록이 있으면 실제 값, 없으면 화면을 볼 수 있도록 대표값으로 채워요.
  const rows = FIT_META.map((fit) => {
    const after = currentFits.find((item) => item.key === fit.key)?.score ?? 0;
    const before = hasPrevious ? fitValue(previousScores, fit.key) : Math.max(0, after - 12);
    return { ...fit, before, after, delta: after - before };
  });
  const prevRow = (fit) => rows.find((row) => row.key === fit.key)?.before ?? 0;

  const trendTotals = history.length >= 2
    ? history.slice(-6).map((item) => Math.round(item.total_score))
    : [64, 68, 72, 79, 83, currentTotal || 88];
  const trendLabels = history.length >= 2
    ? history.slice(-6).map((item) => (item.started_at || "").slice(5, 10).replace("-", ".") || "-")
    : ["04.20", "04.27", "05.04", "05.11", "05.18", "05.24"];
  const trendAvg = trendTotals.map((value) => Math.max(40, value - 6));

  return (
    <motion.section className="page report-page compare-report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <PageToolbar onPrev={onPrev} leftLabel="상세 분석으로 돌아가기" />
        <div className="report-heading">
          <div><h1>연습 비교 분석</h1><p>두 개의 연습 결과를 비교하여 성장 과정을 확인하세요.</p></div>
          <dl className="report-meta-strip">
            <div><CalendarDate size={17} aria-hidden="true" /><dt>현재</dt><dd>{attempts.at(-1)?.started_at?.slice(0, 10) || "방금 완료"}</dd></div>
            <div><CalendarDate size={17} aria-hidden="true" /><dt>이전</dt><dd>{previous?.started_at?.slice(0, 10) || (hasPrevious ? "이전 기록" : "기록 없음")}</dd></div>
          </dl>
        </div>

        <div className="compare-versus">
          <AttemptColumn tone="prev" title="Previous Mirror-Ting" date={previous?.started_at?.slice(0, 10) || "이전 기록"} total={hasPrevious ? previousTotal : trendTotals[0]} rows={rows} which="before" prevRow={prevRow} muted={!hasPrevious} />
          <span className="versus-badge">VS</span>
          <AttemptColumn tone="current" title="Current Mirror-Ting" date={attempts.at(-1)?.started_at?.slice(0, 10) || "방금 완료"} total={currentTotal} rows={rows} which="after" prevRow={prevRow} />
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
                <td>종합 점수</td><td>{hasPrevious ? previousTotal : trendTotals[0]}</td><td><strong>{currentTotal}</strong></td>
                <td><DeltaTag delta={currentTotal - (hasPrevious ? previousTotal : trendTotals[0])} /></td>
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
              { name: "4-Fit 평균", color: "#0ea5e9", values: trendAvg, fill: false },
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
    </motion.section>
  );
}

function AttemptColumn({ tone, title, date, total, rows, which, prevRow, muted = false }) {
  const grade = total >= 80 ? "Great" : total >= 60 ? "Good" : "Try";
  return (
    <Panel className={`attempt-column ${tone} ${muted ? "is-muted" : ""}`}>
      <div className="attempt-column-head"><strong>{title}</strong><small>{date}</small></div>
      <ScoreRing value={total} size="md" label={grade} />
      <div className="attempt-fit-bars">
        {rows.map((row) => <FitBarRow key={row.key} icon={row.icon} label={row.label} tone={row.tone} value={which === "before" ? prevRow(row) : row.after} />)}
      </div>
    </Panel>
  );
}

function DeltaTag({ delta }) {
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return <em className={`delta-tag ${cls}`}>{delta > 0 ? "+" : ""}{delta} {delta > 0 ? "↑" : delta < 0 ? "↓" : "–"}</em>;
}
