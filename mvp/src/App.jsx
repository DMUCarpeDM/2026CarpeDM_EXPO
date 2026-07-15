import { useEffect, useRef, useState } from "react";
import { counterpartProfiles, difficulties, practiceGoals, scenariosForRole } from "./data/setupCatalog";
import { MobileMenuSheet, TopNav } from "./components/navigation/AppNavigation";
import { HomePage } from "./pages/HomePage";
import { PreviewPage } from "./pages/PreviewPage";
import { PracticePage } from "./pages/PracticePage";
import { ResultPage } from "./pages/ResultPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { SharePage } from "./pages/SharePage";
import { ComparePage } from "./pages/ComparePage";
import { DifficultyPage } from "./pages/setup/DifficultyPage";
import { RoleSelectPage } from "./pages/setup/RoleSelectPage";
import { SetupPage } from "./pages/setup/SetupPage";
import {
  REPORT_FLOW_IDLE_TIMEOUT_MS,
  buildRetainedRecord,
  clearActiveSession,
  isReportFlowView,
  retainTurnAudio,
  saveRetainedRecord,
} from "./lib/exhibitionSession";
import {
  createSession,
  finishSession,
  getHealth,
  getHistory,
  getProgress,
  getReport,
  getScenarios,
  getSession,
  issueCode,
  loadActiveSession,
  saveActiveSession,
  submitResponse,
} from "./lib/pocApi";

const flow = [
  { id: "home", label: "메인" },
  { id: "role", label: "기본 설정" },
  { id: "difficulty", label: "상황 선택" },
  { id: "setup", label: "목표 선택" },
  { id: "preview", label: "시나리오 미리보기" },
  { id: "practice", label: "AI와 연습하기" },
  { id: "result", label: "결과 보기" },
  { id: "feedback", label: "자세히 보기" },
  { id: "compare", label: "다시 비교하기" },
  { id: "share", label: "저장하고 공유하기" },
];

export default function App() {
  const [active, setActive] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [counterpart, setCounterpart] = useState("");
  const [counterpartProfile, setCounterpartProfile] = useState("manager");
  const [difficulty, setDifficulty] = useState("basic");
  const [mode, setMode] = useState(5);
  const [selectedScenarioId, setSelectedScenarioId] = useState("manager-incident");
  const [selectedGoalId, setSelectedGoalId] = useState("prep");
  const [session, setSession] = useState(null);
  const [turn, setTurn] = useState(null);
  const [turnHistory, setTurnHistory] = useState([]);
  const [turnSignals, setTurnSignals] = useState(null);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [apiScenarios, setApiScenarios] = useState([]);
  const [aiHealth, setAiHealth] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [permissionState, setPermissionState] = useState({ camera: "prompt", microphone: "prompt" });
  const [pocScenarioSlug, setPocScenarioSlug] = useState("");
  const [consented, setConsented] = useState(false);
  const [apiError, setApiError] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const turnAudioReferencesRef = useRef([]);
  const retainedSessionIdRef = useRef("");
  const scenarioOptions = scenariosForRole(counterpartProfile);
  const selectedSetupScenario = scenarioOptions.find((item) => item.id === selectedScenarioId) || scenarioOptions[0];
  const selectedGoal = practiceGoals[selectedGoalId] || practiceGoals[selectedSetupScenario.goalIds[0]];
  const current = flow.find((item) => item.id === active) || flow[0];
  const previewScenario = {
    ...(apiScenarios.find((item) => item.slug === pocScenarioSlug) || {}),
    title: selectedSetupScenario?.title,
    description: selectedSetupScenario?.text,
  };

  const navigate = (target) => {
    setActive(target);
    setMenuOpen(false);
  };

  useEffect(() => { window.scrollTo(0, 0); }, [active]);
  useEffect(() => {
    getScenarios()
      .then((items) => {
        setApiScenarios(items);
        setPocScenarioSlug((currentSlug) => currentSlug || items[0]?.slug || "");
        setCounterpart((currentCounterpart) => currentCounterpart || items[0]?.characters?.[0]?.id || "");
      })
      .catch(() => setApiError("서버를 실행하면 연습을 시작할 수 있어요."));
  }, []);
  useEffect(() => { getHealth().then(setAiHealth).catch(() => setAiHealth(null)); }, []);
  useEffect(() => {
    const saved = loadActiveSession();
    if (!saved) return;
    getSession(saved)
      .then((resumed) => {
        const resumedSession = { ...resumed, access_token: saved.access_token };
        setSession(resumedSession);
        setTurn(resumed.current_turn);
        setTurnHistory(resumed.history || []);
        if (resumed.status === "in_progress") setActive("practice");
        if (["analyzing", "completed"].includes(resumed.status)) setActive("result");
      })
      .catch(() => localStorage.removeItem("mirrorting-active-session"));
  }, []);
  useEffect(() => {
    if (active !== "result" || !session || report) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const progress = await getProgress(session);
        if (cancelled) return;
        setAnalysisProgress(progress);
        if (progress.stage === "error") throw new Error("분석 중 문제가 생겼어요. 잠시 후 다시 확인해 주세요.");
        if (progress.status !== "completed" && progress.stage !== "done") return;
        const completedReport = await getReport(session);
        setReport(completedReport);
        if (retainedSessionIdRef.current !== session.id) {
          saveRetainedRecord(localStorage, buildRetainedRecord({ session, report: completedReport, audioReferences: turnAudioReferencesRef.current }));
          retainedSessionIdRef.current = session.id;
        }
        setHistory((await getHistory()).items || []);
      } catch (error) {
        if (!cancelled) setApiError(error.message);
      }
    };
    poll();
    const timer = window.setInterval(poll, 800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, report, session]);
  useEffect(() => {
    if (!isReportFlowView(active)) return undefined;
    let timer = 0;
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { clearActiveSession(localStorage); navigate("home"); }, REPORT_FLOW_IDLE_TIMEOUT_MS);
    };
    resetTimer();
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    return () => { window.clearTimeout(timer); events.forEach((eventName) => window.removeEventListener(eventName, resetTimer)); };
  }, [active]);

  const go = (offset) => {
    const currentIndex = flow.findIndex((item) => item.id === active);
    navigate(flow[Math.min(Math.max(currentIndex + offset, 0), flow.length - 1)].id);
  };
  const chooseCounterpartProfile = (profileId) => {
    const nextScenario = scenariosForRole(profileId)[0];
    const nextGoal = practiceGoals[nextScenario.goalIds[0]];
    setCounterpartProfile(profileId);
    setSelectedScenarioId(nextScenario.id);
    setSelectedGoalId(nextGoal.id);
    setMode(nextGoal.mode);
  };
  const chooseSetupScenario = (scenarioId) => {
    const nextScenario = scenarioOptions.find((item) => item.id === scenarioId);
    if (!nextScenario) return;
    const nextGoal = practiceGoals[nextScenario.goalIds[0]];
    setSelectedScenarioId(nextScenario.id);
    setSelectedGoalId(nextGoal.id);
    setMode(nextGoal.mode);
  };
  const chooseGoal = (goalId) => {
    const nextGoal = practiceGoals[goalId];
    if (!nextGoal) return;
    setSelectedGoalId(nextGoal.id);
    setMode(nextGoal.mode);
  };
  const requestExerciseMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState({ camera: "denied", microphone: "denied" });
      throw new Error("이 브라우저에서는 카메라와 마이크 권한을 사용할 수 없어요.");
    }
    try {
      const stream = mediaStream || await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!stream.getVideoTracks().some((track) => track.readyState === "live")) throw new Error("카메라 권한이 필요해요.");
      if (!stream.getAudioTracks().some((track) => track.readyState === "live")) throw new Error("마이크 권한이 필요해요.");
      setMediaStream(stream);
      setPermissionState({ camera: "granted", microphone: "granted" });
      return stream;
    } catch (error) {
      setPermissionState({ camera: "denied", microphone: "denied" });
      throw new Error(error.message || "카메라와 마이크 권한을 허용해야 연습을 시작할 수 있어요.");
    }
  };
  const startPractice = async () => {
    setStarting(true); setApiError(""); setReport(null); setTurnHistory([]); setTurnSignals(null);
    turnAudioReferencesRef.current = [];
    retainedSessionIdRef.current = "";
    try {
      if (!consented) throw new Error("개인정보 처리에 동의하면 역할극을 시작할 수 있어요.");
      await requestExerciseMedia();
      const nextSession = await createSession({ difficulty, mode, scenarioSlug: pocScenarioSlug, consent: consented });
      saveActiveSession(nextSession);
      setSession(nextSession); setTurn(nextSession.current_turn); navigate("practice");
    } catch (error) { setApiError(error.message); } finally { setStarting(false); }
  };
  const sendAnswer = async (input) => {
    if (!session || !turn || !input.text.trim()) return;
    setSubmitting(true); setApiError("");
    try {
      const result = await submitResponse(session, turn.id, { ...input, text: input.text.trim() });
      const audioReference = await retainTurnAudio(session.id, turn.id, input.audio);
      if (audioReference) turnAudioReferencesRef.current = [...turnAudioReferencesRef.current, audioReference];
      setTurnHistory((items) => [...items, { ...turn, response_text: input.text.trim() }]);
      setTurnSignals(result.turn_signals || null);
      if (result.finished) { await finishSession(session); setTurn(null); navigate("result"); } else setTurn(result.next_turn);
    } catch (error) { setApiError(error.message); } finally { setSubmitting(false); }
  };

  return <main className="app-shell">
    <TopNav active={active} scenarioTitle={session?.scenario?.title || selectedSetupScenario?.title} sessionMode={session?.mode || mode} menuOpen={menuOpen} onMenuOpen={setMenuOpen} onNavigate={navigate} scenarios={apiScenarios} onScenarioSelect={(slug) => { const selected = apiScenarios.find((item) => item.slug === slug); setPocScenarioSlug(slug); setCounterpart(selected?.characters?.[0]?.id || ""); navigate("role"); }} />
    <MobileMenuSheet open={menuOpen} active={active} onClose={() => setMenuOpen(false)} onNavigate={navigate} />
    <div className="screen-frame">
      {active === "home" && <HomePage onNext={() => navigate("role")} />}
      {active === "role" && <RoleSelectPage scenario={selectedSetupScenario} counterpart={counterpart} counterpartProfile={counterpartProfile} onCounterpart={setCounterpart} onCounterpartProfile={chooseCounterpartProfile} difficulty={difficulty} onDifficulty={setDifficulty} onPrev={() => go(-1)} onNext={() => navigate("difficulty")} />}
      {active === "difficulty" && <DifficultyPage scenarios={scenarioOptions} selectedScenarioId={selectedSetupScenario.id} onScenario={chooseSetupScenario} counterpartProfile={counterpartProfile} difficulty={difficulty} onPrev={() => go(-1)} onNext={() => navigate("setup")} />}
      {active === "setup" && <SetupPage scenario={selectedSetupScenario} goals={selectedSetupScenario.goalIds.map((goalId) => practiceGoals[goalId])} goal={selectedGoal} onGoal={chooseGoal} counterpartProfile={counterpartProfile} difficulty={difficulties.find((item) => item.id === difficulty)} onPrev={() => go(-1)} onNext={() => navigate("preview")} />}
      {active === "preview" && <PreviewPage onNext={startPractice} starting={starting} scenario={previewScenario} setupScenario={selectedSetupScenario} counterpartProfile={counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1]} goal={selectedGoal} difficulty={difficulties.find((item) => item.id === difficulty) || difficulties[0]} aiHealth={aiHealth} consented={consented} onConsent={setConsented} error={apiError} permissionState={permissionState} mode={mode} />}
      {active === "practice" && <PracticePage onPrev={() => go(-1)} scenario={session?.scenario} aiHealth={aiHealth} turn={turn} history={turnHistory} turnSignals={turnSignals} onSubmit={sendAnswer} busy={submitting} error={apiError} mediaStream={mediaStream} />}
      {active === "result" && <ResultPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("feedback")} report={report} progress={analysisProgress} error={apiError} />}
      {active === "feedback" && <FeedbackPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("compare")} report={report} />}
      {active === "compare" && <ComparePage onPrev={() => go(-1)} onRestart={() => navigate("setup")} onShare={() => navigate("share")} history={history} report={report} />}
      {active === "share" && <SharePage onHome={() => navigate("home")} onPractice={() => navigate("role")} report={report} onIssueCode={issueCode} />}
    </div>
    <span className="screen-reader-note" aria-live="polite">현재 화면: {current.label}</span>
  </main>;
}
