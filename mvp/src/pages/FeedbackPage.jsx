import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Bulb2 } from "reicon-react/icons/Bulb2";
import { Copy } from "reicon-react/icons/Copy";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { InfoCircle } from "reicon-react/icons/InfoCircle";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { User4 } from "reicon-react/icons/User4";
import { ChartTrend } from "reicon-react/icons/ChartTrend";
import { motion } from "framer-motion";
import { useState } from "react";
import { reportFits } from "../lib/reportFits";
import { Chip, DisclosurePanel, FeedbackBox, InsightStep, MiniScoreRow, PageTitle, PageToolbar, Panel, PrimaryButton, ScoreRing, SecondaryButton, SegmentedTabs } from "../components/report/ResultPrimitives";
import { ReportShell } from "../components/report/DashboardShell";

export function FeedbackPage({ onPrev, onPractice, onNext, onNavigate, report }) {
  const [activeTab, setActiveTab] = useState("개선 필요");
  const [whyOpen, setWhyOpen] = useState(false);
  const fits = reportFits(report);
  const strengths = report?.strengths?.length ? report.strengths : ["다음 연습에서 강점을 더 자세히 알려드릴게요."];
  const improvements = report?.improvements?.length ? report.improvements : ["다음 연습에서 개선할 점을 더 자세히 알려드릴게요."];
  const rebuild = report?.rebuild?.items || [];
  const strengthEvidence = report?.evidence_segments?.find((segment) => segment.fit_type === "live" || segment.observed.includes("좋") || segment.observed.includes("우수")) || report?.evidence_segments?.[0];
  const improvementEvidence = report?.evidence_segments?.find((segment) => !segment.observed.includes("좋") && !segment.observed.includes("우수")) || report?.evidence_segments?.[0];
  const headline = report?.headline || {};
  const activeInsight = activeTab === "잘한 점"
    ? { evidence: strengthEvidence, title: strengths[0], intro: "이번 분석에서 특히 좋았던 소통 방식을 정리했어요.", badge: "우수", tone: "blue", action: "유지", detailLabel: "상세 근거 보기", fallback: "좋은 신호가 관찰되었습니다." }
    : { evidence: improvementEvidence, title: improvements[0], intro: "이번 분석을 바탕으로 다음 연습에서 바로 해볼 행동을 정리했어요.", badge: "중요", tone: "accent", action: "개선", detailLabel: "왜 중요한지 보기", fallback: "관찰 근거를 준비하고 있어요." };

  return <ReportShell active="result" trail={["대시보드", "1:1 면담", "상세 분석"]} onNavigate={onNavigate || (() => {})} onDownload={() => { if (typeof window !== "undefined") window.print(); }}><motion.section className="page feedback-page" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
    <PageToolbar onPrev={onPrev} leftLabel="분석 리포트로 돌아가기" />
    <div className="feedback-layout">
      <div>
        <PageTitle title="더 잘하는 방법을 알아봐요" subtitle="다음 대화에서 바로 써볼 방법을 알려줘요." />
        <SegmentedTabs values={["잘한 점", "개선 필요", "추천 답변"]} active={activeTab} onChange={setActiveTab} />
        {activeTab === "추천 답변" ? <AnswerExample rebuild={rebuild} report={report} /> : <InsightCard insight={activeInsight} headline={headline} whyOpen={whyOpen} onToggle={() => setWhyOpen((open) => !open)} />}
        <div className="two-cards"><FeedbackBox tone="blue" title="잘한 점" items={strengths} /><FeedbackBox tone="accent" title="개선하면 더 좋아요" items={improvements} /></div>
      </div>
      <section className="feedback-context" aria-label="분석 보조 정보">
        <DisclosurePanel className="fit-score-panel" title="4-Fit 점수를 한눈에 봐요" icon="fit" defaultOpen>
          {fits.map((fit) => <MiniScoreRow key={fit.key} fit={fit} />)}<hr />
          <div className="score-summary"><ScoreRing value={Math.round(report?.total_score || 0)} size="sm" label="점수" /><div><strong>{report?.percentile_top ? `상위 ${report.percentile_top}%` : "이번 분석 결과"}</strong><p>이번 연습 기준</p><span>{report?.previous ? `${Math.round(report.total_score - report.previous.total_score)}점 이전 기록 대비` : "다음 연습에서 변화 추이를 확인해요"}</span></div></div>
        </DisclosurePanel>
        <DisclosurePanel className="coach-note" title="AI 코치 한마디" icon={Bulb2} defaultOpen={false}><p>{headline.sentence || improvements[0]}</p></DisclosurePanel>
        <DisclosurePanel className="course-card" title="무엇을 살펴봤나요?" icon={InfoCircle} defaultOpen={false}><div><Portrait /><p><strong>{report?.speech_stats?.turns || 0}개 답변을 분석했어요</strong><br />{report?.speech_stats?.measurement?.level === "제한적" ? "텍스트로 연습해서 음성·시선·자세는 측정하지 않았어요." : "대화 중 확인한 신호를 바탕으로 분석했어요."}</p></div></DisclosurePanel>
      </section>
    </div>
    <div className="bottom-actions compact-actions"><SecondaryButton icon={Refresh3} label="다시 연습하기" onClick={onPractice} /><PrimaryButton icon={ChartTrend} label="재연습 결과 비교하기" onClick={onNext} /></div>
  </motion.section></ReportShell>;
}

function InsightCard({ insight, headline, whyOpen, onToggle }) {
  const evidence = insight.evidence;
  return <Panel className="insight-card"><div className="insight-head"><span className={`round-icon ${insight.tone === "blue" ? "blue" : "orange"}`}><User4 size={25} /></span><div><h2>{insight.title}</h2><p>{headline.context || insight.intro}</p></div><Chip tone={insight.tone}>{insight.badge}</Chip></div><div className="insight-flow"><InsightStep icon="eye" title="관찰" text={evidence?.observed || insight.fallback} /><ArrowRight /><InsightStep icon="target" title="해석" text={evidence?.interpretation || "분석 내용을 준비하고 있어요."} /><ArrowRight /><InsightStep icon="growth" title={insight.action} text={evidence?.suggestion || insight.title} /></div><button className={`accordion-row ${whyOpen ? "open" : ""}`} type="button" aria-expanded={whyOpen} onClick={onToggle}>{insight.detailLabel}<ChevronDown size={18} /></button>{whyOpen && <div className="accordion-detail"><p>{headline.context || evidence?.interpretation || "분석 근거를 준비하고 있어요."}</p></div>}</Panel>;
}

function AnswerExample({ rebuild, report }) {
  const text = rebuild[0]?.sentence || rebuild[0]?.after || rebuild[0]?.text || report?.rebuild?.quote;
  const copy = async () => { if (!text) return; try { await navigator.clipboard.writeText(text); alert("추천 답변이 클립보드에 복사되었습니다."); } catch { alert("복사에 실패했습니다."); } };
  return <Panel className="answer-example"><h2>추천 답변 예시</h2><p>{text || "분석을 마치면 추천 답변을 보여드려요."}</p><button type="button" onClick={copy}><Copy size={17} /> 답변 복사하기</button></Panel>;
}

function Portrait() {
  return <span className="portrait coach"><User4 size={72} /></span>;
}
