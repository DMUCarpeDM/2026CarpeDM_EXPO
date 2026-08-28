import { AttractLoop } from "../components/AttractLoop";
import { MobileMenuSheet, TopNav } from "../components/navigation/AppNavigation";
import { NfcStartFallback } from "../components/nfc/NfcStartFallback";
import { ComparePage } from "./ComparePage";
import { FeedbackPage } from "./FeedbackPage";
import { HomePage } from "./HomePage";
import { KioskIssuePage } from "./KioskIssuePage";
import { PracticePage } from "./PracticePage";
import { PreviewPage } from "./PreviewPage";
import { ResultPage } from "./ResultPage";
import { SharePage } from "./SharePage";
import { DifficultyPage } from "./setup/DifficultyPage";
import { RoleSelectPage } from "./setup/RoleSelectPage";
import { ScenarioSelectPage } from "./setup/ScenarioSelectPage";
import { ServiceModeSelectPage } from "./setup/ServiceModeSelectPage";
import { SERVICE_ENTRY_FLOW, isChromelessView } from "../lib/serviceEntryRoute";

const SETUP_NAV_VIEWS = new Set(["role", "scenario", "difficulty", "preview", "practice"]);

export function ServiceEntryShell({
  entry,
  kioskIssueMode,
  view,
  actions,
}) {
  const {
    active, menuOpen, selectedServiceModeId, counterpartProfile, difficulty,
    session, turn, turnHistory, turnSignals, report, history, selectedEpisodeId,
    nfcFallback, consented, apiError,
  } = entry.state;
  const { setMenuOpen, setDifficulty, setNfcFallback, setConsented, setPocScenarioSlug } = entry.setters;
  const { navigate, go, chooseServiceMode, chooseCounterpartProfile, chooseScenario, startFromJobRole } = entry.actions;
  const {
    serviceMode, apiScenarios, previewScenario, previewEpisode, previewCounterpartProfile,
    difficultyOption, aiHealth, permissionState, mediaStream, analysisProgress, starting,
    submitting, mode,
  } = view;
  const {
    startPractice, sendAnswer, requestExerciseMedia, switchMicDevice, transcribeLive, issueCode,
  } = actions;

  if (kioskIssueMode) return <KioskIssuePage />;
  if (active === "boot") return <main className="app-boot" aria-busy="true" />;
  if (isChromelessView(active)) {
    return <main className="chromeless"><ServiceModeSelectPage selectedServiceModeId={selectedServiceModeId} onSelect={chooseServiceMode} /></main>;
  }

  const current = SERVICE_ENTRY_FLOW.find((item) => item.id === active) || SERVICE_ENTRY_FLOW[0];
  const navigationView = SETUP_NAV_VIEWS.has(active) ? "service" : active;

  return <main className={`app-shell ${active === "practice" ? "practice-mode" : ""}`}>
    <TopNav active={navigationView} scenarioTitle={session?.scenario?.title || previewScenario?.title} sessionMode={session?.mode || mode} menuOpen={menuOpen} onMenuOpen={setMenuOpen} onNavigate={navigate} scenarios={apiScenarios} onScenarioSelect={(slug) => { setPocScenarioSlug(slug); navigate("role"); }} />
    <MobileMenuSheet open={menuOpen} active={navigationView} onClose={() => setMenuOpen(false)} onNavigate={navigate} />
    <div className="screen-frame">
      {active === "home" && <HomePage serviceMode={serviceMode} onNext={() => navigate("role")} />}
      {active === "role" && <RoleSelectPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} onCounterpart={chooseCounterpartProfile} onPrev={() => window.history.back()} onNext={() => navigate("scenario")} />}
      {active === "scenario" && <ScenarioSelectPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} scenarios={apiScenarios} selectedEpisodeId={selectedEpisodeId} onScenario={chooseScenario} onPrev={() => go(-1)} onNext={() => navigate("difficulty")} />}
      {active === "difficulty" && <DifficultyPage serviceMode={serviceMode} counterpartProfile={counterpartProfile} scenario={previewScenario} selectedEpisode={previewEpisode} difficulty={difficulty} onDifficulty={setDifficulty} onPrev={() => go(-1)} onNext={() => navigate("preview")} />}
      {active === "preview" && <PreviewPage serviceMode={serviceMode} onNext={startPractice} starting={starting} scenario={previewScenario} selectedEpisode={previewEpisode} counterpartProfile={previewCounterpartProfile} difficulty={difficultyOption} aiHealth={aiHealth} consented={consented} onConsent={setConsented} error={apiError} permissionState={permissionState} mode={mode} />}
      {active === "practice" && <PracticePage onPrev={() => go(-1)} scenario={session?.scenario} aiHealth={aiHealth} turn={turn} history={turnHistory} turnSignals={turnSignals} onSubmit={sendAnswer} busy={submitting} error={apiError} mediaStream={mediaStream} onTranscribe={typeof session?.id === "number" ? (wav) => transcribeLive(session, wav) : null} onRequestMedia={requestExerciseMedia} onSwitchMic={switchMicDevice} />}
      {active === "result" && <ResultPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("feedback")} report={report} selectedDifficulty={difficulty} progress={analysisProgress} error={apiError} />}
      {active === "feedback" && <FeedbackPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("compare")} report={report} />}
      {active === "compare" && <ComparePage onPrev={() => go(-1)} onRestart={() => navigate("role")} onShare={() => navigate("share")} onNavigate={navigate} history={history} report={report} />}
      {active === "share" && <SharePage onHome={() => navigate("home")} onPractice={() => navigate("role")} onNavigate={navigate} report={report} onIssueCode={issueCode} />}
    </div>
    <span className="screen-reader-note" aria-live="polite">현재 화면: {current.label}</span>
    {active === "home" && nfcFallback && <NfcStartFallback onPick={startFromJobRole} onClose={() => setNfcFallback(false)} />}
    {active === "home" && <AttractLoop active onStart={() => navigate("role")} />}
  </main>;
}
