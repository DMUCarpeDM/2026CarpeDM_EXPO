import { useEffect, useRef } from "react";
import { MobileMenuSheet, TopNav } from "../components/navigation/AppNavigation";
import { NfcStartFallback } from "../components/nfc/NfcStartFallback";
import { HomePage } from "./HomePage";
import { KioskIssuePage } from "./KioskIssuePage";
import { UsagePage } from "./UsagePage";
import { PracticePage } from "./PracticePage";
import { PreviewPage } from "./PreviewPage";
import { ResultPage } from "./ResultPage";
import { ResultsHistoryPage } from "./ResultsHistoryPage";
import { SiteIntroPage } from "./SiteIntroPage";
import { DifficultyPage } from "./setup/DifficultyPage";
import { RoleSelectPage } from "./setup/RoleSelectPage";
import { ScenarioSelectPage } from "./setup/ScenarioSelectPage";
import { ServiceModeSelectPage } from "./setup/ServiceModeSelectPage";
import { SERVICE_ENTRY_FLOW, demoDestination, isChromelessView } from "../lib/serviceEntryRoute";
import { workplaceStartView } from "../lib/workplaceTrack";

import { isMirrorDeployment } from "../features/smart-mirror/lib/workplaceMirrorTimeline";

const SETUP_NAV_VIEWS = new Set(["role", "scenario", "difficulty", "preview", "practice"]);

function DemoNotice() {
  const staticDemo = String(import.meta.env.VITE_STATIC_DEMO || "").toLowerCase() === "true";
  const example = Boolean(demoDestination());
  if (!staticDemo && !example) return null;
  return <p className="demo-mode-notice" role="note">{example ? "예시 화면 · 표시된 점수와 답변은 샘플이며 내 측정 결과가 아니에요." : "정적 데모 · 질문과 화면을 체험하는 예시 모드예요. AI 평가·개인 점수·순위는 제공하지 않아요."}</p>;
}

export function ServiceEntryShell({
  entry,
  kioskIssueMode,
  view,
  actions,
}) {
  const {
    active, menuOpen, selectedServiceModeId, counterpartProfile, difficulty,
    session, turn, turnHistory, turnSignals, report, history, selectedEpisodeId,
    nfcFallback, nfcCard, consented, apiError,
  } = entry.state;
  const { setMenuOpen, setDifficulty, setNfcFallback, setNfcCard, setConsented, setPocScenarioSlug } = entry.setters;
  const { navigate, go, chooseServiceMode, chooseCounterpartProfile, chooseScenario, startFromJobRole } = entry.actions;
  const {
    serviceMode, apiScenarios, previewScenario, previewEpisode, previewCounterpartProfile,
    difficultyOption, aiHealth, permissionState, mediaStream, analysisProgress, starting,
    submitting, linkRetrying, mode, scenarioStatus,
  } = view;
  const {
    startPractice, sendAnswer, endPractice, requestExerciseMedia, switchMicDevice, issueCode, retryScenarios, retryCardLink,
  } = actions;
  const mirror = isMirrorDeployment();
  const contentRef = useRef(null);
  useEffect(() => {
    if (kioskIssueMode) return;
    const label = SERVICE_ENTRY_FLOW.find((item) => item.id === active)?.label;
    if (label) document.title = `${label} · Mirror-Ting`;
    contentRef.current?.focus({ preventScroll: true });
  }, [active, kioskIssueMode]);

  if (kioskIssueMode) return <KioskIssuePage />;
  if (active === "boot") return <main className="app-boot" aria-busy="true" />;
  if (isChromelessView(active)) {
    return <div className="chromeless"><DemoNotice /><ServiceModeSelectPage selectedServiceModeId={selectedServiceModeId} onSelect={chooseServiceMode} /></div>;
  }

  const current = SERVICE_ENTRY_FLOW.find((item) => item.id === active) || SERVICE_ENTRY_FLOW[0];
  const navigationView = SETUP_NAV_VIEWS.has(active) ? "service" : active === "result" ? "records" : active;
  const startView = workplaceStartView(serviceMode?.id);

  return <div className={`app-shell ${mirror ? "mirror-deployment" : ""} ${active === "practice" ? "practice-mode" : ""} ${active === "home" ? `home-mode home-mode-${serviceMode?.id || "workplace"}` : ""}`}>
    <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
    {!mirror && <TopNav active={navigationView} serviceMode={serviceMode} scenarioTitle={session?.scenario?.title || previewScenario?.title} menuOpen={menuOpen} onMenuOpen={setMenuOpen} onNavigate={navigate} scenarios={apiScenarios} onScenarioSelect={(slug) => { setPocScenarioSlug(slug); navigate("role"); }} practiceMode={active === "practice"} hasReport={Boolean(report)} />}
    {!mirror && <MobileMenuSheet open={menuOpen} active={navigationView} onClose={() => setMenuOpen(false)} onNavigate={navigate} practiceMode={active === "practice"} />}
    <main className="screen-frame" id="main-content" ref={contentRef} tabIndex={-1}>
      <DemoNotice />
      {session?.kiosk_link_status === "pending" && <div className="preview-error" role="status">사원증 결과 연결을 기다리고 있어요. <button type="button" disabled={linkRetrying} onClick={retryCardLink}>{linkRetrying ? "연결 확인 중" : "사원증 연결 다시 시도"}</button></div>}
      {session?.kiosk_link_status === "conflict" && <p className="preview-error" role="alert">사원증이 재발급되어 이 결과를 연결할 수 없어요. 운영자에게 문의하고 다음 체험에서는 다시 태그해주세요.</p>}
      {active === "home" && apiError && <p className="preview-error" role="alert">{apiError}</p>}
      {active === "usage" && <UsagePage onPractice={() => navigate("home")} />}
      {active === "intro" && <SiteIntroPage onPractice={() => navigate("home")} />}
      {active === "records" && <ResultsHistoryPage onResultBack={() => navigate("home")} onPractice={() => navigate("home")} report={report} history={history} onIssueCode={issueCode} selectedDifficulty={difficulty} progress={analysisProgress} error={apiError} />}
      {active === "home" && <HomePage serviceMode={serviceMode} onNext={() => navigate(startView)} onModeSelect={() => navigate("service")} />}
      {active === "role" && <RoleSelectPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} onCounterpart={chooseCounterpartProfile} onPrev={() => window.history.back()} onNext={() => navigate("scenario")} />}
      {active === "scenario" && <ScenarioSelectPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} scenarios={apiScenarios} status={scenarioStatus} onRetry={retryScenarios} selectedEpisodeId={selectedEpisodeId} onScenario={chooseScenario} onPrev={() => go(-1)} onNext={() => navigate("difficulty")} />}
      {active === "difficulty" && <DifficultyPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} scenario={previewScenario} selectedEpisode={previewEpisode} difficulty={difficulty} onDifficulty={setDifficulty} onPrev={() => go(-1)} onNext={() => navigate("preview")} />}
      {active === "preview" && <PreviewPage externalCard={Boolean(nfcCard?.kioskSessionId)} serviceMode={serviceMode} onPrev={() => navigate("difficulty")} onNext={startPractice} starting={starting} scenario={previewScenario} selectedEpisode={previewEpisode} counterpartProfile={previewCounterpartProfile} difficulty={difficultyOption} aiHealth={aiHealth} consented={consented} onConsent={setConsented} error={apiError} permissionState={permissionState} mode={mode} />}
      {active === "practice" && <PracticePage session={session} onFinish={endPractice} onPrev={() => go(-1)} scenario={session?.scenario} aiHealth={aiHealth} turn={turn} history={turnHistory} turnSignals={turnSignals} onSubmit={sendAnswer} busy={submitting} error={apiError} mediaStream={mediaStream} onRequestMedia={requestExerciseMedia} onSwitchMic={switchMicDevice} />}
      {active === "result" && <ResultPage onPrev={() => navigate("home")} onPractice={() => navigate("preview")} report={report} history={history} onIssueCode={issueCode} selectedDifficulty={difficulty} progress={analysisProgress} error={apiError} />}
    </main>
    <span className="screen-reader-note" aria-live="polite">현재 화면: {current.label}</span>
    {active === "home" && mirror && nfcFallback && !nfcCard?.kioskSessionId && <p role="alert">카드를 확인하지 못했어요. 운영자에게 도움을 요청해 주세요.</p>}
    {active === "home" && nfcFallback && (!mirror || nfcCard?.kioskSessionId) && <NfcStartFallback cardConfirmed={Boolean(nfcCard?.kioskSessionId)} serviceMode={serviceMode?.id} onPick={startFromJobRole} onClose={() => { setNfcFallback(false); setNfcCard(null); }} />}
  </div>;
}
