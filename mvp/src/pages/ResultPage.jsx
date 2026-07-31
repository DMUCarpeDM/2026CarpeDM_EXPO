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
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { reportFits } from "../lib/reportFits";
import { RadarChart, TrendChart } from "../components/report/Charts";
import { PersonaFace } from "../components/ui/PersonaFace";
import { IconGlyph } from "../components/ui/IconGlyph";
import { PageToolbar, Panel, ScoreRing } from "../components/report/ResultPrimitives";

const DIFFICULTY_LABELS = {
  basic: "기본 모드",
  pressure: "압박 모드",
  ultra_pressure: "초압박 모드",
};
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

export function ResultPage({ onPrev, onPractice, onNext, report, selectedDifficulty, progress, error }) {
  // 영수증 QR (E-21 / S-B2B-CLAIM) — claim_url이 있으면 QR로 렌더한다. 훅은 조기 반환(로딩
  // 화면)보다 먼저 호출해야 한다 — 리포트 도착 시 훅 개수가 달라지면 React가 죽는다.
  const [claimQr, setClaimQr] = useState("");
  const claimUrl = report?.claim_url || "";
  useEffect(() => {
    if (!claimUrl) { setClaimQr(""); return undefined; }
    let cancelled = false;
    QRCode.toDataURL(claimUrl, { width: 240, margin: 1, color: { dark: "#4A2E1F", light: "#F7EFE6" } })
      .then((dataUrl) => { if (!cancelled) setClaimQr(dataUrl); })
      .catch(() => { if (!cancelled) setClaimQr(""); });
    return () => { cancelled = true; };
  }, [claimUrl]);

  if (!report) {
    return (
      <section className="page report-page">
        <PageToolbar onPrev={onPrev} leftLabel="역할극으로 돌아가기" />
        <Panel className="loading-card"><span className="spinner" /><div><h3>분석 결과를 준비하고 있어요</h3><p>{error || `분석 중이에요 · ${progress?.pct ?? progress?.pct ?? 0}%`}</p></div></Panel>
      </section>
    );
  }

  const fits = reportFits(report);
  const total = Math.round(report.total_score ?? 0);
  // 서버 등급(S-B2B-SCORE: 우수/양호/보통/연습 필요)이 오면 그대로 쓰고, 없으면 기존 표기.
  const grade = report.grade || (total >= 80 ? "Great" : total >= 60 ? "Good" : "Try");
  const percentile = report.percentile_top ? `상위 ${report.percentile_top}%` : total >= 80 ? "상위 18%" : "상위 40%";
  const strengths = report.strengths?.length ? report.strengths : ["답변의 핵심을 먼저 정리하려는 흐름이 잘 보였어요.", "상대에게 다음 행동을 분명히 알렸어요.", "끝까지 차분한 목소리를 유지했어요."];
  const improvements = report.improvements?.length ? report.improvements : ["결론과 기한을 한 문장으로 먼저 말해 보세요.", "근거를 한 가지 덧붙이면 설득력이 높아져요."];
  const insight = report.headline?.sentence || improvements[0];
  const effectiveDifficulty = selectedDifficulty || report.difficulty;
  const difficultyClass = effectiveDifficulty === "basic" ? "basic" : "pressure";
  const difficultyLabel = DIFFICULTY_LABELS[effectiveDifficulty] || "기본 모드";
  const stats = report.speech_stats || {};
  // 파라링귀스틱 요약 (S-B2B-PARA) — 말 속도(SPM)·필러를 실측 스트립에 함께 보여줘요.
  const para = stats.paralinguistics || {};
  const fillerTop = Array.isArray(para.filler_top) && para.filler_top[0] ? para.filler_top[0][0] : "";
  const adaptation = report.deep_analysis?.adaptation;
  const dayEnding = report.day_ending;
  // Before→After 코칭 카드 (F-4 / S-B2B-COACH) — 실제 발화 인용 → 이슈 → 제안 문장.
  const coaching = Array.isArray(report.coaching) ? report.coaching.filter((card) => card?.suggestion) : [];
  // 실측 요약 스트립 — "측정했다"는 증거를 숫자로 먼저 보여줘요.
  const statItems = [
    stats.turns ? { label: "답변", value: `${stats.turns}턴` } : null,
    stats.total_syllables ? { label: "총 발화", value: `${stats.total_syllables}음절` } : null,
    // 분당 음절(SPM)이 오면 해석 문구와 함께 그쪽을 쓰고, 없으면 기존 초당 표기를 유지해요.
    para.speech_rate_spm
      ? { label: "말 속도", value: `분당 ${para.speech_rate_spm}음절${para.speech_rate_note ? ` · ${para.speech_rate_note}` : ""}` }
      : stats.avg_speech_rate ? { label: "말 속도", value: `${stats.avg_speech_rate}음절/초` } : null,
    Number.isFinite(para.filler_count) ? { label: "필러", value: `${para.filler_count}회${fillerTop ? ` · 주로 “${fillerTop}”` : ""}` } : null,
    typeof stats.formal_pct === "number" ? { label: "격식 표현", value: `${stats.formal_pct}%` } : null,
    stats.measurement?.frames ? { label: "영상 분석", value: `${stats.measurement.frames}프레임` } : null,
    stats.measurement?.audio_sec ? { label: "음성 분석", value: `${Math.round(stats.measurement.audio_sec)}초` } : null,
  ].filter(Boolean);
  const meta = [
    { Icon: Clock3, label: "연습 시간", value: `${report.mode ?? 5}분` },
    { Icon: CalendarDate, label: "연습 날짜", value: report.finished_label || "방금 완료" },
    { Icon: User, label: "AI 상대", value: report.character_name || report.scenario_title || "AI 상대" },
  ];

  return (
    <motion.section className="page report-page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
      <PageToolbar onPrev={onPrev} leftLabel="연습 화면으로 돌아가기" />
        <div className="report-grid-2col">
          <aside className="report-side-col">
            <Panel className="overall-score-card">
              <h2>종합 점수</h2>
              <ScoreRing value={total} label={grade} />
              <span className="percentile-badge">{percentile}</span>
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
            {claimQr && (
              <Panel className="claim-qr-card">
                <h2>결과 가져가기</h2>
                <img src={claimQr} alt="결과 귀속 QR 코드" width="240" height="240" />
                <p>QR을 찍으면 이 결과를 계정에 담을 수 있어요.</p>
              </Panel>
            )}
          </aside>

          <section className="report-main-col">
            <div className="report-heading">
              <div><h1>코칭 개요</h1><p>이번 연습의 핵심 요약과 맞춤 코칭 포인트예요.</p></div>
              <dl className="report-meta-strip">
                {meta.map((item) => <div key={item.label}><item.Icon size={17} aria-hidden="true" /><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
                <div><dt className="sr-only">난이도</dt><dd><span className={`difficulty-chip ${difficultyClass}`}><AlertTriangle size={14} aria-hidden="true" /> {difficultyLabel}</span></dd></div>
              </dl>
            </div>

            {statItems.length > 0 && (
              <dl className="speech-stats-strip" aria-label="이번 연습 실측 요약">
                {statItems.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
              </dl>
            )}

            <Panel className="coaching-overview">
              <div className="coaching-columns">
                <CoachingList tone="good" title="잘한 점 (Strengths)" items={strengths} />
                <CoachingList tone="improve" title="개선 포인트 (Areas to Improve)" items={improvements} />
              </div>
            </Panel>

            {coaching.length > 0 && (
              <Panel className="coach-move-card">
                <div className="coach-move-head">
                  <h2>코치의 한 수 <span className="coach-move-chip">Before → After</span></h2>
                  <p>실제로 했던 말을 코치가 다시 써 봤어요. 소리 내어 따라 읽어 보세요.</p>
                </div>
                <ol className="coach-move-list">
                  {coaching.map((card, index) => (
                    <li key={`${card.turn_order ?? "t"}-${index}`}>
                      {card.turn_order ? <span className="coach-move-turn">{card.turn_order}턴</span> : null}
                      {card.quote && <blockquote className="coach-move-before">“{card.quote}”</blockquote>}
                      {card.issue && <p className="coach-move-issue">{card.issue}</p>}
                      <p className="coach-move-after"><b aria-hidden="true">→</b>{card.suggestion}</p>
                      {card.manual_ref?.title && <small className="coach-move-ref">카페 온도 응대 매뉴얼 · {card.manual_ref.title}</small>}
                    </li>
                  ))}
                </ol>
              </Panel>
            )}

            {adaptation?.points?.length >= 2 && (
              <Panel className="adaptation-card">
                <div className="deep-panel-head">
                  <h2>{adaptation.title || "적응 곡선"} <span className={`trend-chip ${adaptation.trend || "flat"}`}>{adaptation.trend === "up" ? "상승" : adaptation.trend === "down" ? "하강" : "유지"}</span></h2>
                  {adaptation.confidence && <span className="confidence-chip">{adaptation.confidence.level} · {adaptation.confidence.n}턴 근거</span>}
                </div>
                <TrendChart
                  height={170}
                  min={Math.max(0, Math.floor(Math.min(...adaptation.points.map((p) => p.score)) / 10) * 10 - 10)}
                  max={100}
                  series={[{ name: "턴별 점수", color: "#0064ff", values: adaptation.points.map((p) => Math.round(p.score)) }]}
                  xLabels={adaptation.points.map((p) => `${p.turn_order}턴`)}
                />
                {adaptation.comment && <p className="deep-panel-comment">{adaptation.comment}</p>}
              </Panel>
            )}

            <Panel className="insight-radar-card">
              <div className="insight-radar-copy">
                <span className="round-icon blue"><Bulb2 size={22} /></span>
                <div><h2>핵심 인사이트</h2><p>{insight}</p></div>
              </div>
              <RadarChart fits={fits} />
            </Panel>

            {dayEnding?.text && (
              <Panel className="day-ending-card">
                <span className="day-ending-avatar"><PersonaFace name={report.character_name || ""} /></span>
                <div>
                  <h2>하루의 결말 {dayEnding.label && <em className="day-ending-chip">{dayEnding.label}</em>}</h2>
                  <p>“{dayEnding.text}”</p>
                  <small>{report.character_name || "AI 상대"}의 마무리 — 답변 수행도에 따라 결말이 달라져요</small>
                </div>
              </Panel>
            )}

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
    </motion.section>
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
