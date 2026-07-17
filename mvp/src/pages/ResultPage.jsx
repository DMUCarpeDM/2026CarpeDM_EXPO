import { AlertTriangle } from "reicon-react/icons/AlertTriangle";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Bulb2 } from "reicon-react/icons/Bulb2";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { ChartBarTrendUp } from "reicon-react/icons/ChartBarTrendUp";
import { Check } from "reicon-react/icons/Check";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { Clock3 } from "reicon-react/icons/Clock3";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { User } from "reicon-react/icons/User";
import { motion } from "framer-motion";
import { reportFits } from "../lib/reportFits";
import { RadarChart } from "../components/report/Charts";
import { ReportShell } from "../components/report/DashboardShell";
import { IconGlyph } from "../components/ui/IconGlyph";
import { PageToolbar, Panel, ScoreRing } from "../components/report/ResultPrimitives";

// 브레드크럼은 실제 연습한 시나리오 제목을 보여줘요 (없으면 일반 라벨).
const trailFor = (report) => ["홈", report?.scenario_title || "연습 리포트", "성과 리포트"];
// 4-Fit 키를 한글 이름으로 표시해요 (핵심 지표 행: 응답 (Response) 형태).
const FIT_KOREAN = { "Response-Fit": "응답", "Voice-Fit": "목소리", "Eye-Fit": "시선", "Posture-Fit": "자세" };

// 점수대별 상태 라벨. 디자인의 '아주 좋음 / 좋음 / 보통' 표기를 따라요.
function fitGrade(fit) {
  if (fit.measured === false) return "측정 제외";
  if (fit.score >= 85) return "아주 좋음";
  if (fit.score >= 70) return "좋음";
  if (fit.score >= 55) return "보통";
  return "노력 필요";
}

export function ResultPage({ onPrev, onPractice, onNext, onNavigate, report, progress, error, hasHistory = false }) {
  const navigate = onNavigate || (() => {});
  const download = () => { if (typeof window !== "undefined") window.print(); };

  if (!report) {
    // progress가 아직 없다 = 분석 중인 세션 자체가 없다 (분석 중이면 폴링이 바로 채워요).
    const analyzing = Boolean(progress) || Boolean(error);
    return (
      <ReportShell active="result" trail={trailFor(report)} onNavigate={navigate} onDownload={download}>
        {analyzing ? (
          <>
            <PageToolbar onPrev={onPrev} leftLabel="역할극으로 돌아가기" />
            <Panel className="loading-card"><span className="spinner" /><div><h3>분석 결과를 준비하고 있어요</h3><p>{error || `분석 중이에요 · ${progress?.pct ?? 0}%`}</p></div></Panel>
          </>
        ) : (
          <Panel className="loading-card report-empty-card">
            <div>
              <h3>{hasHistory ? "이번 방문에 완료한 연습이 아직 없어요" : "아직 완료된 연습이 없어요"}</h3>
              <p>{hasHistory ? "지난 기록은 비교 분석에서 볼 수 있고, 새 연습을 마치면 결과가 여기에 나타나요." : "연습을 마치면 4-Fit 분석 결과가 여기에 나타나요."}</p>
              <button type="button" className="primary-button" onClick={onPractice}>연습 시작하기</button>
              {hasHistory && <button type="button" className="secondary-button" onClick={() => navigate("compare")}>지난 기록 보기</button>}
            </div>
          </Panel>
        )}
      </ReportShell>
    );
  }

  const fits = reportFits(report);
  const total = Math.round(report.total_score ?? 0);
  const grade = total >= 80 ? "Great" : total >= 60 ? "Good" : "Try";
  // 백분위·코칭은 실제 분석값만 보여줘요 — 대표값으로 꾸미면 심사·전시에서 신뢰를 잃어요.
  const percentile = report.percentile_top ? `상위 ${report.percentile_top}%` : "";
  const strengths = report.strengths?.length ? report.strengths : ["이번 연습에서는 충분한 발화가 없어 잘한 점을 찾지 못했어요. 한 번 더 연습해 보세요."];
  const improvements = report.improvements?.length ? report.improvements : ["질문마다 한두 문장이라도 소리 내어 답해 보면 코칭이 만들어져요."];
  const insight = report.headline?.sentence || improvements[0];
  const pressure = report.difficulty === "pressure";
  const meta = [
    { Icon: Clock3, label: "연습 시간", value: `${report.mode ?? 5}분` },
    { Icon: CalendarDate, label: "연습 날짜", value: report.finished_label || "방금 완료" },
    { Icon: User, label: "AI 상대", value: report.character_name || report.scenario_title || "AI 상대" },
  ];

  return (
    <ReportShell active="result" trail={trailFor(report)} onNavigate={navigate} onDownload={download}>
      <motion.div className="report-page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <div className="report-grid-2col">
          <aside className="report-side-col">
            <Panel className="overall-score-card">
              <h2>종합 점수</h2>
              <ScoreRing value={total} label={grade} />
              {percentile && <span className="percentile-badge">{percentile}</span>}
              <p className="score-note">종합 점수는 4-Fit 신호를 함께 반영한 결과예요. 아래 핵심 지표에서 영역별 흐름을 확인해 보세요.</p>
            </Panel>
            <Panel className="fit-key-card">
              <h2>4-Fit 핵심 지표</h2>
              <ul className="fit-key-list">
                {fits.map((fit) => (
                  <li key={fit.key}>
                    <button type="button" onClick={onNext} className={`fit-key-row ${fit.color}`}>
                      <span className="fit-key-icon"><IconGlyph icon={fit.icon} size={22} /></span>
                      <span className="fit-key-main">
                        <span className="fit-key-top">
                          <span className="fit-key-name">{FIT_KOREAN[fit.key] || fit.label}<em>({fit.key.replace("-Fit", "")})</em></span>
                          <b>{fit.measured === false ? "—" : fit.score}<small>/100</small></b>
                        </span>
                        <i className="fit-key-bar"><span style={{ width: `${fit.measured === false ? 0 : fit.score}%` }} /></i>
                        <em className="fit-key-grade">{fitGrade(fit)}</em>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>

          <section className="report-main-col">
            <div className="report-heading">
              <div><h1>코칭 개요</h1><p>이번 연습의 핵심 요약과 맞춤 코칭 포인트예요.</p></div>
              <dl className="report-meta-strip">
                {meta.map((item) => <div key={item.label}><item.Icon size={17} aria-hidden="true" /><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
                <div><dt className="sr-only">난이도</dt><dd><span className={`difficulty-chip ${pressure ? "pressure" : "basic"}`}><AlertTriangle size={14} aria-hidden="true" /> {pressure ? "Pressure Mode" : "Basic Mode"}</span></dd></div>
              </dl>
            </div>

            <Panel className="coaching-overview">
              <div className="coaching-columns">
                <CoachingList tone="good" title="잘한 점 (Strengths)" items={strengths} />
                <CoachingList tone="improve" title="개선 포인트 (Areas to Improve)" items={improvements} />
              </div>
            </Panel>

            <Panel className="insight-radar-card">
              <div className="insight-radar-copy">
                <span className="round-icon blue"><Bulb2 size={22} /></span>
                <div><h2>핵심 인사이트</h2><p>{insight}</p></div>
              </div>
              <RadarChart fits={fits} />
            </Panel>

            <button className="report-detail-row" type="button" onClick={onNext}>
              <ChartBarTrendUp size={22} />
              <span><b>상세 분석 보기</b><small>응답 패턴, 음성 분석, 시선 힌트와 자세 변화를 더 확인해 보세요.</small></span>
              <ArrowRight size={20} />
            </button>

            <div className="report-page-actions">
              <button type="button" className="secondary-button" onClick={onPractice}><Refresh3 size={20} /> 같은 상황 다시 연습</button>
              <button type="button" className="primary-button" onClick={onNext}>자세히 보기 <ArrowRight size={20} /></button>
            </div>
          </section>
        </div>
      </motion.div>
    </ReportShell>
  );
}

function CoachingList({ tone, title, items }) {
  const Icon = tone === "good" ? Check : AlertTriangle;
  return (
    <div className={`coaching-list ${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}><span className="coaching-bullet"><Icon size={14} aria-hidden="true" /></span>{item}</li>
        ))}
      </ul>
    </div>
  );
}
