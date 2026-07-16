import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { Check } from "reicon-react/icons/Check";
import { Download } from "reicon-react/icons/Download";
import { Gallery } from "reicon-react/icons/Gallery";
import { Home3 } from "reicon-react/icons/Home3";
import { motion } from "framer-motion";
import { useState } from "react";
import { reportFits } from "../lib/reportFits";
import { Chip, ExportCard, FitColumn, PageToolbar, Panel, PrimaryButton, ScoreRing } from "../components/report/ResultPrimitives";
import { ReportShell } from "../components/report/DashboardShell";

export function SharePage({ onHome, onPractice, onNavigate, report, onIssueCode }) {
  const [shareNotice, setShareNotice] = useState("체험 코드를 발급하면 다른 방문에서도 같은 익명 기록을 이어갈 수 있어요.");
  const [code, setCode] = useState("");
  const shareUrl = code ? `체험 코드: ${code}` : "체험 코드를 만들면 기록을 이어볼 수 있어요.";
  const updateNotice = async (message, copyText) => { try { if (copyText && navigator.clipboard?.writeText) await navigator.clipboard.writeText(copyText); } catch {} setShareNotice(message); };
  const issueCode = async () => { try { const result = await onIssueCode(); setCode(result.code); setShareNotice("체험 코드를 만들었어요."); } catch (error) { setShareNotice(error.message); } };
  const fits = reportFits(report);

  return <ReportShell active="share" trail={["대시보드", "1:1 면담", "저장 및 공유"]} onNavigate={onNavigate || (() => {})} onDownload={() => { if (typeof window !== "undefined") window.print(); }}><motion.section className="page share-page" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
    <PageToolbar onPrev={onHome} leftLabel="홈으로 돌아가기" />
    <div className="complete-hero"><span className="success-mark"><Check size={58} /></span><h1>연습을 저장하고 공유해요</h1><p>연습을 마쳤어요. 기록을 남기고 필요한 사람에게 공유해 보세요.</p></div>
    <div className="share-layout">
      <div className="share-left">
        <ReportPreview report={report} fits={fits} />
        <div className="export-grid">
          <ExportCard icon="report" title="기록 저장" text="연습 기록은 이 기기에 익명으로 저장해요." onClick={() => updateNotice("이 기기에 연습 기록을 저장했어요.")} />
          <ExportCard icon={Download} title="PDF로 저장하기" text="리포트를 PDF로 인쇄하거나 저장해 보세요." tone="accent" onClick={() => window.print()} />
          <ExportCard icon={Gallery} title="이미지로 저장하기" text="결과 이미지를 저장하는 기능을 준비하고 있어요." tone="sky" onClick={() => alert("이미지 저장 기능을 준비하고 있습니다. 현재 기기 화면 캡처 또는 PDF 인쇄 기능을 사용하실 수 있습니다.")} />
          <ExportCard icon="share" title="체험 코드 만들기" text="체험 코드를 만들면 같은 기록을 이어볼 수 있어요." tone="blue" onClick={issueCode} />
        </div>
        <PrimaryButton icon={Home3} label="홈으로 돌아가기" onClick={onHome} wide />
        <button className="link-button" type="button" onClick={onPractice}>다른 연습하기 <ArrowRight size={16} /></button>
      </div>
      <section className="share-preview card" aria-label="공유 기록 미리보기"><h2>기록 미리보기</h2><p>이번 분석 결과를 한눈에 볼 수 있어요.</p><Panel className="mini-report"><h3>연습 리포트</h3><span>방금 마친 연습</span><div className="mini-report-body"><ScoreRing value={Math.round(report?.total_score || 0)} size="xs" label="점수" /><div className="preview-fit-grid">{fits.map((fit) => <FitColumn key={fit.key} fit={fit} compact />)}</div></div></Panel><h3>체험 코드</h3><p className="share-notice">{shareNotice}</p><div className="copy-field"><span>{shareUrl}</span><button type="button" onClick={code ? () => updateNotice("체험 코드를 복사했어요.", code) : issueCode}>{code ? "복사" : "발급"}</button></div></section>
    </div>
  </motion.section></ReportShell>;
}

function ReportPreview({ report, fits }) {
  return <Panel className="report-preview-card"><div className="report-preview-head"><Chip>완료</Chip><h2>연습 리포트</h2><span>방금 마친 연습 <CalendarDate size={17} /></span></div><div className="report-preview-body"><ScoreRing value={Math.round(report?.total_score || 0)} size="md" label="점수" /><div className="preview-fit-grid">{fits.map((fit) => <FitColumn key={fit.key} fit={fit} />)}</div></div></Panel>;
}
