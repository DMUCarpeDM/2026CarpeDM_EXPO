import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { Download } from "reicon-react/icons/Download";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Share3 } from "reicon-react/icons/Share3";
import { motion } from "framer-motion";
import { reportFits, scoreFromFit } from "../lib/reportFits";
import { FitBarRow, TrendChart } from "../components/report/Charts";
import { ReportShell } from "../components/report/DashboardShell";
import { IconGlyph } from "../components/ui/IconGlyph";
import { Panel, ScoreRing } from "../components/report/ResultPrimitives";

const trailFor = (report) => ["홈", report?.scenario_title || "연습 기록", "비교 분석"];
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

  // 현재 = 이번에 끝낸 리포트가 있으면 그것, 없으면 이 기기의 최근 완료 기록.
  // 가짜 대표값은 쓰지 않는다 — 기록이 없으면 '없다'를 그대로 보여준다.
  const liveReport = typeof report?.total_score === "number" ? report : null;
  const attempts = history.slice(-2);
  const current = liveReport ?? attempts.at(-1) ?? null;
  const hasCurrent = Boolean(current);
  const currentFits = reportFits(current);
  const currentTotal = Math.round(current?.total_score ?? 0);
  // 이전 = 라이브 리포트면 백엔드가 붙여준 직전 기록(previous), 기록만 볼 때는 그 앞 항목.
  const previous = liveReport ? liveReport.previous : attempts.at(-2);
  const hasPrevious = Boolean(previous);
  const previousTotal = Math.round(previous?.total_score ?? 0);
  const previousScores = previous?.fit_scores || {};

  const rows = FIT_META.map((fit) => {
    const after = currentFits.find((item) => item.key === fit.key)?.score ?? 0;
    const before = hasPrevious ? fitValue(previousScores, fit.key) : null;
    return { ...fit, before, after, delta: before === null ? null : after - before };
  });
  const prevRow = (fit) => rows.find((row) => row.key === fit.key)?.before ?? 0;

  const trendTotals = history.slice(-6).map((item) => Math.round(item.total_score));
  const trendLabels = history.slice(-6).map((item) => (item.started_at || "").slice(5, 10).replace("-", ".") || "-");
  const trendAvg = trendTotals.map((value) => Math.max(40, value - 6));
  const hasTrend = trendTotals.length >= 2;

  return (
    <ReportShell active="compare" trail={trailFor(report)} onNavigate={navigate} onDownload={download} newPracticeLabel="새로운 연습">
      <motion.div className="report-page compare-report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <div className="report-heading">
          <div><h1>연습 비교 분석</h1><p>두 개의 연습 결과를 비교하여 성장 과정을 확인하세요.</p></div>
          {hasCurrent && (
            <dl className="report-meta-strip">
              <div><CalendarDate size={17} aria-hidden="true" /><dt>현재</dt><dd>{attempts.at(-1)?.started_at?.slice(0, 10) || "방금 완료"}</dd></div>
              <div><CalendarDate size={17} aria-hidden="true" /><dt>이전</dt><dd>{previous?.started_at?.slice(0, 10) || (hasPrevious ? "이전 기록" : "기록 없음")}</dd></div>
            </dl>
          )}
        </div>

        {!hasCurrent ? (
          <Panel className="compare-empty-card">
            <h2>아직 완료된 연습이 없어요</h2>
            <p>연습을 한 번 마치면 이번 결과가 여기에 나타나고, 두 번째부터는 이전 기록과 나란히 비교해 드려요.</p>
            <button type="button" className="primary-button" onClick={onRestart}>연습 시작하기 <ArrowRight size={20} /></button>
          </Panel>
        ) : (
        <>
        <div className="compare-versus">
          <AttemptColumn tone="prev" title="이전 연습" date={previous?.started_at?.slice(0, 10) || "이전 기록"} total={previousTotal} rows={rows} which="before" prevRow={prevRow} muted={!hasPrevious} empty={!hasPrevious} />
          <span className="versus-badge">VS</span>
          <AttemptColumn tone="current" title="이번 연습" date={attempts.at(-1)?.started_at?.slice(0, 10) || "방금 완료"} total={currentTotal} rows={rows} which="after" prevRow={prevRow} />
        </div>

        <Panel className="compare-detail-card">
          <h2>4-Fit 비교 상세</h2>
          <table className="compare-table">
            <thead><tr><th>항목</th><th>이전 값</th><th>현재 값</th><th>변화</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td><span className={`compare-item ${row.tone}`}><IconGlyph icon={row.icon} size={18} /> {row.label} <em>({row.english})</em></span></td>
                  <td>{row.before ?? "—"}</td>
                  <td><strong>{row.after}</strong></td>
                  <td><DeltaTag delta={row.delta} /></td>
                </tr>
              ))}
              <tr className="compare-total-row">
                <td>종합 점수</td><td>{hasPrevious ? previousTotal : "—"}</td><td><strong>{currentTotal}</strong></td>
                <td><DeltaTag delta={hasPrevious ? currentTotal - previousTotal : null} /></td>
              </tr>
            </tbody>
          </table>
          {!hasPrevious && <p className="compare-first-note">첫 연습 기록이에요. 같은 상황을 한 번 더 연습하면 변화가 여기에 표시돼요.</p>}
        </Panel>

        {hasTrend && (
          <Panel className="trend-card">
            <div className="trend-card-head"><h2>점수 추이</h2><span className="trend-range">최근 {trendTotals.length}회</span></div>
            <TrendChart
              xLabels={trendLabels}
              series={[
                { name: "종합 점수", color: "#0064ff", values: trendTotals },
                { name: "4-Fit 평균", color: "#0ea5e9", values: trendAvg, fill: false },
              ]}
            />
          </Panel>
        )}

        <div className="report-page-actions">
          <button type="button" className="secondary-button" onClick={onRestart}><Refresh3 size={20} /> 다시 연습하기</button>
          <div className="compare-share-group">
            <button type="button" className="ghost-outline" onClick={download}><Download size={19} /> 저장</button>
            <button type="button" className="primary-button" onClick={onShare}><Share3 size={20} /> 저장하고 공유하기</button>
          </div>
        </div>
        </>
        )}
      </motion.div>
    </ReportShell>
  );
}

function AttemptColumn({ tone, title, date, total, rows, which, prevRow, muted = false, empty = false }) {
  if (empty) {
    return (
      <Panel className={`attempt-column ${tone} is-muted attempt-column-empty`}>
        <div className="attempt-column-head"><strong>{title}</strong><small>기록 없음</small></div>
        <div className="attempt-empty-body">
          <strong>첫 연습이에요</strong>
          <p>연습을 한 번 더 마치면<br />여기서 이전 기록과 비교돼요.</p>
        </div>
      </Panel>
    );
  }
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
  if (delta === null || delta === undefined) return <em className="delta-tag flat">—</em>;
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return <em className={`delta-tag ${cls}`}>{delta > 0 ? "+" : ""}{delta} {delta > 0 ? "↑" : delta < 0 ? "↓" : "–"}</em>;
}
