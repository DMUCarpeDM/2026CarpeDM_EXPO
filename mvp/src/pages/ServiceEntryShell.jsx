import { useEffect, useRef, useState } from "react";
import { MobileMenuSheet, TopNav } from "../components/navigation/AppNavigation";
import { NfcStartFallback } from "../components/nfc/NfcStartFallback";
import { WorkspaceNavigation } from "../components/navigation/WorkspaceNavigation";
import "../styles/lovable-layout.css";
import { HomePage } from "./HomePage";
import { SimulationChatPage } from "./SimulationChatPage";
import { FaqPage } from "./FaqPage";
import { PricingPage } from "./PricingPage";
import { AccountPage } from "./AccountPage";
import { readAccount, clearAccount } from "../lib/accountApi";
import "../styles/commerce.css";
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
import { isWorkplaceSession } from "../lib/workplaceTrack";
import { shouldArmReportIdleReset } from "../lib/exhibitionSession";
import { useFaceTracking } from "../lib/useFaceTracking";
import { useMirrorVisitorIdle } from "../lib/useMirrorVisitorIdle";

import { WorkplaceMirrorWelcomePage } from "../features/smart-mirror/components/WorkplaceMirrorWelcomePage";
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
    session, turn, turnHistory, turnSignals, report, history,
    nfcFallback, nfcCard, consented, apiError, nfcError, scenarioPrompt,
  } = entry.state;
  const { setMenuOpen, setDifficulty, setNfcFallback, setNfcCard, setConsented, setPocScenarioSlug, setScenarioPrompt } = entry.setters;
  const { navigate, go, chooseServiceMode, chooseCounterpartProfile, startFromJobRole, startMirrorExperience, returnToStart } = entry.actions;
  const {
    serviceMode, apiScenarios, previewScenario, previewEpisode, previewCounterpartProfile,
    difficultyOption, aiHealth, permissionState, mediaStream, analysisProgress, starting,
    submitting, linkRetrying, mode,
  } = view;
  const {
    startPractice, prepareMirror, sendAnswer, endPractice, requestExerciseMedia, switchMicDevice, issueCode, retryCardLink,
  } = actions;
  const mirror = isMirrorDeployment();
  const [account, setAccount] = useState(readAccount);
  const [resumePrompt, setResumePrompt] = useState(false);
  const finishAuthentication = value => {
    setAccount(value);
    const next = resumePrompt && scenarioPrompt.trim() ? "simulation-chat" : "home";
    setResumePrompt(false); navigate(next);
  };
  useEffect(() => {
    if (!mirror && !account && active === "simulation-chat") { setResumePrompt(true); navigate("signup"); }
  }, [active, account, mirror]);
  const beginPrompt = () => {
    if (account) navigate("simulation-chat");
    else { setResumePrompt(true); navigate("signup"); }
  };
  const logout = () => { clearAccount(); setAccount(null); returnToStart(); };
  const analysisVideoRef = useRef(null);
  const overlayRef = useRef(null);
  const idlePausedRef = useRef(false);
  // Keep the same local trackers alive when practice hands off to the report.
  const trackingStream = active === "practice" || (mirror && active === "result") ? mediaStream : null;
  const track = useFaceTracking(trackingStream, analysisVideoRef, overlayRef, mirror && isWorkplaceSession(session));
  const markVisitorActivity = useMirrorVisitorIdle({
    enabled: mirror && (active === "practice" || shouldArmReportIdleReset(active, report)),
    mediaStream, lastPersonAtRef: track.lastPersonAtRef, pausedRef: idlePausedRef, onIdle: returnToStart,
  });
  useEffect(() => {
    if (mirror && active === "result" && analysisVideoRef.current) analysisVideoRef.current.srcObject = mediaStream;
  }, [active, mirror, mediaStream]);
  useEffect(() => {
    if (mirror && active === "result" && !mediaStream) requestExerciseMedia().catch(() => {});
  }, [active, mirror]);
  const contentRef = useRef(null);
  useEffect(() => {
    if (kioskIssueMode) return;
    const label = SERVICE_ENTRY_FLOW.find((item) => item.id === active)?.label;
    if (label) document.title = `${active === "service" && !mirror ? "메인" : label} · Mirror-Ting`;
    contentRef.current?.focus({ preventScroll: true });
  }, [active, kioskIssueMode]);

  if (kioskIssueMode) return <KioskIssuePage />;
  if (active === "boot") return <main className="app-boot" aria-busy="true" />;
  if (mirror && isChromelessView(active)) {
    return <div className="chromeless"><DemoNotice /><ServiceModeSelectPage selectedServiceModeId={selectedServiceModeId} onSelect={chooseServiceMode} /></div>;
  }

  const authPage = !mirror && ["login", "signup"].includes(active);
  const workspace = !mirror && (Boolean(account) || active === "simulation-chat") && !["login", "signup"].includes(active);
  const current = SERVICE_ENTRY_FLOW.find((item) => item.id === active) || SERVICE_ENTRY_FLOW[0];
  const navigationView = SETUP_NAV_VIEWS.has(active) ? "service" : active === "result" ? "records" : active;

  return <div className={`app-shell ${authPage ? "auth-page-shell" : ""} ${workspace ? "member-workspace" : ""} ${active === "simulation-chat" ? "editor-workspace" : ""} ${mirror ? "mirror-deployment" : ""} ${active === "practice" ? "practice-mode" : ""} ${["home", "service"].includes(active) ? `home-mode home-mode-${serviceMode?.id || "workplace"}` : ""}`}>
    {!mirror && <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>}
    {workspace && <WorkspaceNavigation active={active} account={account} onNavigate={navigate} onLogout={logout} />}
    {!mirror && !workspace && !authPage && <TopNav active={navigationView} scenarioTitle={session?.scenario?.title || previewScenario?.title} menuOpen={menuOpen} onMenuOpen={setMenuOpen} onNavigate={navigate} scenarios={apiScenarios} onScenarioSelect={(slug) => { setPocScenarioSlug(slug); navigate("role"); }} practiceMode={active === "practice"} account={account} onLogout={logout} />}
    {!mirror && <MobileMenuSheet open={menuOpen} active={navigationView} onClose={() => setMenuOpen(false)} onNavigate={navigate} practiceMode={active === "practice"} />}
    <main className="screen-frame" id="main-content" ref={contentRef} tabIndex={-1}>
      {!(mirror && active === "home") && <DemoNotice />}
      {session?.kiosk_link_status === "pending" && <div className={mirror ? "mirror-card-notice" : "preview-error"} role="status">사원증 결과 연결을 기다리고 있어요. <button type="button" disabled={linkRetrying} onClick={retryCardLink}>{linkRetrying ? "연결 확인 중" : "사원증 연결 다시 시도"}</button></div>}
      {session?.kiosk_link_status === "conflict" && <p className={mirror ? "mirror-card-notice" : "preview-error"} role="alert">사원증이 재발급되어 이 결과를 연결할 수 없어요. 운영자에게 문의하고 다음 체험에서는 다시 태그해주세요.</p>}
      {mirror && active === "result" && report && session?.kiosk_link_status === "linked" && <p className="mirror-card-notice" role="status">리포트가 준비됐어요. 출력 키오스크에서 같은 사원증을 태그해 주세요.</p>}
      {mirror && active === "result" && report && session?.kiosk_link_status === "not_requested" && <p className="mirror-card-notice" role="status">사원증 없이 시작한 체험이에요. 리포트를 출력하려면 사원증을 태그해 새 체험을 시작해 주세요.</p>}
      {active === "home" && !mirror && apiError && <p className="preview-error" role="alert">{apiError}</p>}
      {!mirror && account && active === "simulation-chat" && <SimulationChatPage key={`${serviceMode.id}:${scenarioPrompt}`} prompt={scenarioPrompt} serviceMode={serviceMode.id} />}
      {active === "faq" && <FaqPage />}
      {active === "pricing" && <PricingPage onStart={() => navigate("home")} />}
      {["login", "signup"].includes(active) && <AccountPage key={active} kind={active} pendingPrompt={resumePrompt ? scenarioPrompt : ""} onNavigate={navigate} onAuthenticated={finishAuthentication} />}
      {active === "usage" && <UsagePage onPractice={() => navigate("home")} />}
      {active === "intro" && <SiteIntroPage onPractice={() => navigate("home")} />}
      {active === "records" && <ResultsHistoryPage onResultBack={() => navigate("home")} onPractice={() => navigate("home")} report={mirror ? report : null} history={history} onIssueCode={issueCode} selectedDifficulty={difficulty} progress={mirror ? analysisProgress : null} error={apiError} />}
      {mirror && active === "home" && <WorkplaceMirrorWelcomePage onStart={startMirrorExperience} nfcError={nfcError} />}
      {!mirror && ["home", "service"].includes(active) && <HomePage dashboard={Boolean(account)} history={Array.isArray(history) ? history : []} onRecords={() => navigate("records")} serviceMode={serviceMode} prompt={scenarioPrompt} onPrompt={setScenarioPrompt} onNext={beginPrompt} onModePick={id => chooseServiceMode(id, true)} onModeSelect={() => navigate("service")} />}
      {mirror && active === "role" && <RoleSelectPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} onCounterpart={chooseCounterpartProfile} onPrev={() => window.history.back()} onNext={() => navigate("scenario")} />}
      {mirror && active === "scenario" && <ScenarioSelectPage serviceMode={serviceMode} prompt={scenarioPrompt} onPrompt={setScenarioPrompt} onPrev={() => window.history.back()} onNext={() => navigate("difficulty")} />}
      {mirror && active === "difficulty" && <DifficultyPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} scenario={previewScenario} selectedEpisode={previewEpisode} difficulty={difficulty} onDifficulty={setDifficulty} onPrev={() => navigate("home")} onNext={() => navigate("preview")} />}
      {mirror && active === "preview" && <PreviewPage serviceMode={serviceMode} onPrev={() => navigate("difficulty")} onNext={startPractice} onPrepare={prepareMirror} previewKey={`${nfcCard?.uid || ""}:${nfcCard?.issuedCount || ""}:${nfcCard?.kioskSessionId || ""}`} starting={starting} scenario={previewScenario} selectedEpisode={previewEpisode} counterpartProfile={previewCounterpartProfile} difficulty={difficultyOption} aiHealth={aiHealth} consented={consented} onConsent={setConsented} error={apiError} permissionState={permissionState} mode={mode} />}
      {mirror && active === "practice" && <PracticePage session={session} onFinish={endPractice} onPrev={() => go(-1)} scenario={session?.scenario} aiHealth={aiHealth} turn={turn} history={turnHistory} turnSignals={turnSignals} onSubmit={sendAnswer} busy={submitting} error={apiError} mediaStream={mediaStream} onRequestMedia={requestExerciseMedia} onSwitchMic={switchMicDevice} track={track} analysisVideoRef={analysisVideoRef} overlayRef={overlayRef} idlePausedRef={idlePausedRef} onVisitorActivity={markVisitorActivity} />}
      {mirror && active === "result" && <video ref={analysisVideoRef} className="screen-reader-note" autoPlay muted playsInline aria-hidden="true" tabIndex={-1} />}
      {mirror && active === "result" && <ResultPage mirror={mirror && serviceMode?.id === "workplace"} onPrev={() => navigate("home")} onPractice={() => navigate("preview")} report={report} history={history} onIssueCode={issueCode} selectedDifficulty={difficulty} progress={analysisProgress} error={apiError} />}
    </main>
    <span className="screen-reader-note" aria-live="polite">현재 화면: {active === "service" && !mirror ? "메인" : current.label}</span>

    {active === "home" && nfcFallback && !mirror && <NfcStartFallback cardConfirmed={Boolean(nfcCard?.kioskSessionId)} serviceMode={serviceMode?.id} onPick={startFromJobRole} onClose={() => { setNfcFallback(false); setNfcCard(null); }} />}
  </div>;
}
