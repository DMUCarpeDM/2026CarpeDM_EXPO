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

// 자체 크롬(사이드바/전용 상단바)을 가진 화면은 전역 상단 네비를 숨겨요.
const CHROMELESS_VIEWS = new Set(["practice", "result", "feedback", "compare"]);

// 백엔드 없이도 리포트/비교/연습 화면을 미리 볼 수 있게 하는 데모 데이터 (?demo=result 등).
const DEMO_REPORT = {
  total_score: 88, percentile_top: 18, mode: 5, difficulty: "pressure",
  finished_label: "2024.05.24 14:32", character_name: "팀장 김민수", scenario_title: "서버 장애 보고",
  fit_scores: {
    "Response-Fit": { score: 86, summary: "핵심부터 말해 전달이 또렷했어요." },
    "Voice-Fit": { score: 82, summary: "안정적인 속도로 말했어요." },
    "Eye-Fit": { score: 78, summary: "시선을 꾸준히 맞췄어요." },
    "Posture-Fit": { score: 91, summary: "끝까지 바른 자세를 유지했어요." },
  },
  strengths: [
    "결론을 먼저 말하고 근거를 덧붙이는 흐름이 좋았어요.",
    "장애 영향 범위를 숫자로 구체화해 신뢰를 줬어요.",
    "다음 대응 계획과 기한을 분명히 전달했어요.",
    "끝까지 차분한 목소리를 유지했어요.",
    "상대의 추가 질문에도 당황하지 않고 답했어요.",
  ],
  improvements: [
    "첫 문장에서 핵심 결론을 조금 더 앞세워 보세요.",
    "불확실한 부분은 '확인 후 공유'로 명확히 구분해 보세요.",
    "중요한 수치는 한 번 더 강조해 보세요.",
    "말끝을 흐리지 않고 문장을 끝맺어 보세요.",
  ],
  headline: { sentence: "결론을 먼저, 근거는 한 문장으로 요약하면 설득력이 더 올라가요." },
  previous: { total_score: 72, started_at: "2024-05-20", fit_scores: { "Response-Fit": 72, "Voice-Fit": 68, "Eye-Fit": 78, "Posture-Fit": 82 } },
  speech_stats: { turns: 5, measurement: { level: "표준" } },
};
const DEMO_HISTORY = [
  { session_id: "d1", total_score: 61, started_at: "2024-04-20" },
  { session_id: "d2", total_score: 66, started_at: "2024-04-27" },
  { session_id: "d3", total_score: 71, started_at: "2024-05-04" },
  { session_id: "d4", total_score: 76, started_at: "2024-05-11" },
  { session_id: "d5", total_score: 72, started_at: "2024-05-20", fit_scores: { "Response-Fit": 72, "Voice-Fit": 68, "Eye-Fit": 78, "Posture-Fit": 82 } },
  { session_id: "d6", total_score: 88, started_at: "2024-05-24", fit_scores: { "Response-Fit": 86, "Voice-Fit": 82, "Eye-Fit": 78, "Posture-Fit": 91 } },
];
const DEMO_SESSION = { id: "demo", mode: 5, scenario: { title: "서버 장애 보고", characters: [{ id: "c1", name: "팀장 김민수", role: "상사 / 관리자", personality: "직설적이고 바쁘다. 결론부터 듣고 싶어 한다." }] } };
const DEMO_TURN = { id: "t1", order: 1, character_id: "c1", question_text: "이번 프로젝트 진행 상황을 간단히 요약해주시고, 현재 가장 어려운 부분은 무엇인지 설명해 주세요." };

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
  // 분석 서버 상태를 주기적으로 확인해 상단 네비 칩과 준비 화면이 항상 현재 상태를 보여줘요.
  useEffect(() => {
    const check = () => getHealth().then(setAiHealth).catch(() => setAiHealth(null));
    check();
    const timer = window.setInterval(check, 15000);
    return () => window.clearInterval(timer);
  }, []);
  // 결과·비교 화면에 상단 메뉴로 바로 들어와도 이 기기의 지난 기록이 보이도록 부팅 시 로드해요.
  // (?demo= 모드는 아래 데모 효과가 데모 기록으로 덮어써요)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo")) return;
    getHistory().then((data) => setHistory(data.items || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (!demo) return;
    setReport(DEMO_REPORT);
    setHistory(DEMO_HISTORY);
    if (demo === "practice") { setSession(DEMO_SESSION); setTurn(DEMO_TURN); setActive("practice"); }
    else if (["result", "feedback", "compare"].includes(demo)) setActive(demo);
  }, []);
  useEffect(() => {
    const saved = loadActiveSession();
    if (!saved) return;
    getSession(saved)
      .then((resumed) => {
        const resumedSession = { ...resumed, access_token: saved.access_token };
        setSession(resumedSession);
        setTurn(resumed.current_turn);
        setTurnHistory(resumed.history || []);
        if (resumed.status === "in_progress") {
          setActive("practice");
          // 복귀 세션은 시작 플로우를 건너뛰므로 여기서 카메라·마이크를 다시 잡아야
          // 녹음이 재개된다 (권한이 이미 허용된 키오스크에서는 조용히 성공).
          requestExerciseMedia().catch((error) => setApiError(error.message));
        }
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
  // 연습 종료: 답변이 하나라도 있으면 분석으로 마무리하고, 없으면 세션을 정리하고 홈으로.
  // (이전에는 이전 화면으로만 이동해 in_progress 세션이 남아 재방문 때마다 복귀되는 혼란이 있었어요)
  const endPractice = async () => {
    if (session && turnHistory.length > 0) {
      try {
        await finishSession(session);
        setTurn(null);
        navigate("result");
        return;
      } catch (error) { setApiError(error.message); }
    }
    clearActiveSession(localStorage);
    setSession(null);
    setTurn(null);
    setTurnHistory([]);
    navigate("home");
  };

  const chromeless = CHROMELESS_VIEWS.has(active);

  return <main className={`app-shell ${chromeless ? "chromeless" : ""}`}>
    {!chromeless && <TopNav active={active} scenarioTitle={session?.scenario?.title || selectedSetupScenario?.title} sessionMode={session?.mode || mode} aiHealth={aiHealth} menuOpen={menuOpen} onMenuOpen={setMenuOpen} onNavigate={navigate} scenarios={apiScenarios} onScenarioSelect={(slug) => { const selected = apiScenarios.find((item) => item.slug === slug); setPocScenarioSlug(slug); setCounterpart(selected?.characters?.[0]?.id || ""); navigate("role"); }} />}
    <MobileMenuSheet open={menuOpen} active={active} onClose={() => setMenuOpen(false)} onNavigate={navigate} />
    <div className="screen-frame">
      {active === "home" && <HomePage onNext={() => navigate("role")} />}
      {active === "role" && <RoleSelectPage scenario={selectedSetupScenario} counterpart={counterpart} counterpartProfile={counterpartProfile} onCounterpart={setCounterpart} onCounterpartProfile={chooseCounterpartProfile} difficulty={difficulty} onDifficulty={setDifficulty} onPrev={() => go(-1)} onNext={() => navigate("difficulty")} />}
      {active === "difficulty" && <DifficultyPage scenarios={scenarioOptions} selectedScenarioId={selectedSetupScenario.id} onScenario={chooseSetupScenario} counterpartProfile={counterpartProfile} difficulty={difficulty} onPrev={() => go(-1)} onNext={() => navigate("setup")} />}
      {active === "setup" && <SetupPage scenario={selectedSetupScenario} goals={selectedSetupScenario.goalIds.map((goalId) => practiceGoals[goalId])} goal={selectedGoal} onGoal={chooseGoal} counterpartProfile={counterpartProfile} difficulty={difficulties.find((item) => item.id === difficulty)} onPrev={() => go(-1)} onNext={() => navigate("preview")} />}
      {active === "preview" && <PreviewPage onNext={startPractice} starting={starting} scenario={previewScenario} setupScenario={selectedSetupScenario} counterpartProfile={counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1]} goal={selectedGoal} difficulty={difficulties.find((item) => item.id === difficulty) || difficulties[0]} aiHealth={aiHealth} consented={consented} onConsent={setConsented} error={apiError} permissionState={permissionState} mode={mode} />}
      {active === "practice" && <PracticePage onPrev={() => go(-1)} scenario={session?.scenario} aiHealth={aiHealth} turn={turn} history={turnHistory} turnSignals={turnSignals} onSubmit={sendAnswer} busy={submitting} error={apiError} mediaStream={mediaStream} onReconnectMedia={() => requestExerciseMedia().catch((error) => setApiError(error.message))} onEnd={endPractice} />}
      {active === "result" && <ResultPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("feedback")} onNavigate={navigate} report={report} progress={analysisProgress} error={apiError} hasHistory={history.length > 0} />}
      {active === "feedback" && <FeedbackPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("compare")} onNavigate={navigate} report={report} />}
      {active === "compare" && <ComparePage onPrev={() => go(-1)} onRestart={() => navigate("setup")} onShare={() => navigate("share")} onNavigate={navigate} history={history} report={report} />}
      {active === "share" && <SharePage onHome={() => navigate("home")} onPractice={() => navigate("role")} report={report} onIssueCode={issueCode} />}
    </div>
    <span className="screen-reader-note" aria-live="polite">현재 화면: {current.label}</span>
  </main>;
}
