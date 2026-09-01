import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { Check } from "reicon-react/icons/Check";
import { Clock3 } from "reicon-react/icons/Clock3";
import { Download } from "reicon-react/icons/Download";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Share3 } from "reicon-react/icons/Share3";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { TrendChart } from "../components/report/Charts";
import { PageToolbar, ScoreRing } from "../components/report/ResultPrimitives";
import { Badge, Button, Card, CardContent, Progress } from "../components/ui/shadcn";
import { reportFits } from "../lib/reportFits";
import { fitAriaLabel, saveAndShareReport } from "../lib/unifiedReport";

const DIFFICULTY_LABELS = { basic: "기본 모드", pressure: "압박 모드", ultra_pressure: "고강도 압박 모드" };
const FIT_LABELS = { "Response-Fit": "응답", "Voice-Fit": "목소리", "Expression-Fit": "표정", "Posture-Fit": "자세" };

function fitGrade(fit) {
  if (fit.measured === false) return "측정 안 됨";
  if (fit.score >= 85) return "아주 좋아요";
  if (fit.score >= 70) return "좋아요";
  if (fit.score >= 55) return "보통이에요";
  return "연습이 필요해요";
}

function formatAttemptDate(value, fallback) {
  if (!value) return fallback;
  return String(value).slice(0, 10).replaceAll("-", ".");
}

function scoreLabel(total, grade) {
  if (grade) return grade;
  if (total >= 85) return "아주 좋아요";
  if (total >= 70) return "좋아요";
  if (total >= 55) return "보통이에요";
  return "조금 더 연습해요";
}

function buildHistory(history, report) {
  const attempts = Array.isArray(history) ? history.filter((item) => Number.isFinite(Number(item?.total_score))) : [];
  const latest = attempts.at(-1);
  const reportId = report?.session_id ?? report?.attempt_id ?? report?.id;
  const latestId = latest?.session_id ?? latest?.attempt_id ?? latest?.id;
  const latestIsCurrent = latest === report || (reportId != null && latestId === reportId);
  const previous = report?.previous || (latestIsCurrent ? attempts.at(-2) : latest) || null;
  const trendAttempts = latestIsCurrent ? attempts.slice(-6) : [...attempts.slice(-5), report].filter(Boolean);
  return { previous, trendAttempts };
}

export function ResultPage({
  onPrev,
  onPractice,
  onReset,
  onIssueCode,
  report,
  history = [],
  selectedDifficulty,
  progress,
  error,
}) {
  const [shareNotice, setShareNotice] = useState("");
  const [sharing, setSharing] = useState(false);
  const historyData = useMemo(() => buildHistory(history, report), [history, report]);

  if (!report) {
    const progressValue = Math.max(0, Math.min(100, Number(progress?.pct) || 0));
    return (
      <section className="page report-page unified-report unified-report--loading">
        <PageToolbar onPrev={onPrev} leftLabel="연습 화면으로 돌아가기" />
        <Card className="unified-report__loading-card" role="status" aria-live="polite">
          <CardContent>
            <span className="unified-report__loading-value">{progressValue}%</span>
            <div><h1>분석 결과를 정리하고 있어요</h1><p>{error || "대화에서 확인한 신호를 한 페이지로 모으고 있어요."}</p></div>
            <Progress value={progressValue} aria-label={`분석 진행률 ${progressValue}%`} />
          </CardContent>
        </Card>
      </section>
    );
  }

  const fits = reportFits(report);
  const total = Math.round(Number(report.total_score) || 0);
  const strengths = report.strengths?.length ? report.strengths : ["이번 연습에서 잘한 점을 다음 결과에서 더 자세히 알려드릴게요."];
  const improvements = report.improvements?.length ? report.improvements : ["핵심 내용을 한 문장으로 먼저 말해 보세요."];
  const topImprovement = report.headline?.sentence || improvements[0];
  const difficulty = selectedDifficulty || report.difficulty;
  const stats = report.speech_stats || {};
  const para = stats.paralinguistics || {};
  const measurement = stats.measurement || {};
  const coachingCard = Array.isArray(report.coaching) ? report.coaching.find((item) => item?.suggestion) : null;
  const rebuildItem = report.rebuild?.items?.find((item) => item?.sentence || item?.after || item?.text);
  const beforeAnswer = coachingCard?.quote || report.rebuild?.quote || "원문 기록이 없어요.";
  const afterAnswer = coachingCard?.suggestion || rebuildItem?.sentence || rebuildItem?.after || rebuildItem?.text || topImprovement;
  const evidenceSegments = Array.isArray(report.evidence_segments) ? report.evidence_segments : [];
  const previousTotal = Number.isFinite(Number(historyData.previous?.total_score)) ? Math.round(Number(historyData.previous.total_score)) : null;
  const scoreDelta = previousTotal === null ? null : total - previousTotal;
  const trendTotals = historyData.trendAttempts.map((item) => Math.round(Number(item.total_score) || 0));
  const trendLabels = historyData.trendAttempts.map((item, index) => formatAttemptDate(item.started_at, `${index + 1}회`));
  const evidenceItems = [
    stats.turns ? { label: "분석한 답변", value: `${stats.turns}개` } : null,
    para.speech_rate_spm ? { label: "말 속도", value: `분당 ${para.speech_rate_spm}음절` } : stats.avg_speech_rate ? { label: "말 속도", value: `${stats.avg_speech_rate}음절/초` } : null,
    Number.isFinite(para.filler_count) ? { label: "필러", value: `${para.filler_count}회` } : null,
    measurement.frames ? { label: "영상 분석", value: `${measurement.frames}프레임` } : null,
    measurement.audio_sec ? { label: "음성 분석", value: `${Math.round(measurement.audio_sec)}초` } : null,
    typeof stats.formal_pct === "number" ? { label: "격식 표현", value: `${stats.formal_pct}%` } : null,
  ].filter(Boolean).slice(0, 4);

  const handleRetry = () => (onReset ? onReset() : onPractice?.());
  const handleSaveShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await saveAndShareReport({ onIssueCode, total, navigatorObject: navigator, locationHref: window.location.href, printPage: () => window.print() });
      if (result.notice) setShareNotice(result.notice);
    } catch (shareError) {
      if (shareError?.name !== "AbortError") setShareNotice(shareError?.message || "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <motion.section className="page report-page unified-report" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
      <PageToolbar onPrev={onPrev} leftLabel="연습 화면으로 돌아가기" />

      <header className="unified-report__heading">
        <div><p className="unified-report__eyebrow">연습 결과</p><h1>이번 대화를 한눈에 정리했어요</h1><p>잘한 점부터 다음 연습에서 바꿀 한 가지까지 순서대로 확인해 보세요.</p></div>
        <dl className="unified-report__meta" aria-label="연습 정보">
          <div><CalendarDate size={16} aria-hidden="true" /><dt>완료</dt><dd>{report.finished_label || "방금"}</dd></div>
          <div><Clock3 size={16} aria-hidden="true" /><dt>연습</dt><dd>{report.mode || 5}분</dd></div>
          <div><dt>난이도</dt><dd>{DIFFICULTY_LABELS[difficulty] || "기본 모드"}</dd></div>
        </dl>
      </header>

      <Card className="unified-report__summary">
        <CardContent>
          <div className="unified-report__score-block">
            <p>종합 점수</p><ScoreRing value={total} size="md" />
            <Badge variant="outline">{scoreLabel(total, report.grade)}</Badge>
            {report.percentile_top ? <small>같은 기준에서 상위 {report.percentile_top}%예요.</small> : null}
          </div>
          <div className="unified-report__fit-grid" aria-label="4-Fit 지표">
            {fits.map((fit) => (
              <article className="unified-report__fit" key={fit.key}>
                <div><p>{FIT_LABELS[fit.key] || fit.label}</p><strong>{fit.measured === false ? "—" : fit.score}</strong></div>
                <Progress value={fit.measured === false ? 0 : fit.score} aria-label={fitAriaLabel(fit, FIT_LABELS[fit.key] || fit.label)} />
                <small>{fitGrade(fit)}{fit.provisional ? " · 참고 지표" : ""}</small>
              </article>
            ))}
          </div>
          <div className="unified-report__summary-notes">
            <section><h2>이번에 잘한 점</h2><p><Check size={18} aria-hidden="true" />{strengths[0]}</p></section>
            <section><h2>가장 먼저 바꿀 점</h2><p>{topImprovement}</p></section>
          </div>
        </CardContent>
      </Card>

      <section className="unified-report__section" aria-labelledby="coaching-title">
        <div className="unified-report__section-heading"><p>AI 코칭</p><h2 id="coaching-title">이 답변부터 바꿔 보세요</h2><span>{coachingCard?.issue || report.headline?.context || "결론을 먼저 말하면 상대가 핵심을 더 빠르게 이해할 수 있어요."}</span></div>
        <Card className="unified-report__rewrite">
          <CardContent>
            <div><span>내 답변</span><blockquote>“{beforeAnswer}”</blockquote></div>
            <ArrowRight className="unified-report__rewrite-arrow" size={24} aria-hidden="true" />
            <div><span>이렇게 말해 보세요</span><blockquote>“{afterAnswer}”</blockquote></div>
          </CardContent>
        </Card>
        <div className="unified-report__next-actions"><h3>다음 연습에서 바꿔요</h3><ol>{improvements.slice(0, 3).map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}</ol></div>
      </section>

      <section className="unified-report__details" aria-label="분석 근거와 이전 기록">
        <Card className="unified-report__evidence">
          <CardContent>
            <div className="unified-report__card-heading"><p>분석 근거</p><h2>어떤 신호를 살펴봤나요?</h2></div>
            {evidenceItems.length ? <dl className="unified-report__evidence-stats">{evidenceItems.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : <p className="unified-report__empty">이번 연습에서 수집한 대화 신호를 바탕으로 분석했어요.</p>}
            {evidenceSegments[0]?.observed ? <p className="unified-report__evidence-note">{evidenceSegments[0].observed}</p> : null}
          </CardContent>
        </Card>
        <Card className="unified-report__history">
          <CardContent>
            <div className="unified-report__card-heading"><p>이전 기록</p><h2>{scoreDelta === null ? "두 번째 연습부터 변화를 보여드려요" : `이전보다 ${Math.abs(scoreDelta)}점 ${scoreDelta >= 0 ? "올랐어요" : "낮아졌어요"}`}</h2></div>
            {trendTotals.length >= 2 ? <TrendChart height={178} min={Math.max(0, Math.min(...trendTotals) - 10)} max={100} series={[{ name: "종합 점수", color: "var(--color-apple-blue)", values: trendTotals, fill: false }]} xLabels={trendLabels} /> : <div className="unified-report__history-empty"><strong>{total}점</strong><p>지금 결과를 기준으로 다음 연습과 비교할게요.</p></div>}
          </CardContent>
        </Card>
      </section>

      <footer className="unified-report__actions">
        <div><h2>한 번 더 연습하면 변화가 더 잘 보여요</h2><p>같은 상황을 다시 연습하거나, 지금 결과를 저장해 두세요.</p>{shareNotice ? <span role="status" aria-live="polite">{shareNotice}</span> : null}</div>
        <div>
          <Button type="button" variant="outline" size="lg" onClick={handleRetry}><Refresh3 size={19} aria-hidden="true" /> 같은 상황 다시 연습</Button>
          <Button type="button" size="lg" onClick={handleSaveShare} disabled={sharing}>{onIssueCode ? <Share3 size={19} aria-hidden="true" /> : <Download size={19} aria-hidden="true" />}{sharing ? "저장하고 있어요" : "저장·공유"}</Button>
        </div>
      </footer>
    </motion.section>
  );
}
