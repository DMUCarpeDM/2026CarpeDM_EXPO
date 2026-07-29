import { useEffect, useRef, useState } from "react";
import { counterpartProfiles, difficulties, getRoleScenarioOptions } from "./data/setupCatalog";
import { AttractLoop } from "./components/AttractLoop";
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
import { ScenarioSelectPage } from "./pages/setup/ScenarioSelectPage";
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
  transcribeLive,
} from "./lib/pocApi";

// 모든 흐름에서 같은 상단 네비게이션을 사용해 화면 전환 감각을 유지해요.
const CHROMELESS_VIEWS = new Set();

// getUserMedia 실패 원인별 안내 — 전시 스태프가 즉시 조치할 수 있는 문장으로
function mediaErrorMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "카메라·마이크 권한이 차단되어 있어요. 주소창 오른쪽 카메라 아이콘에서 허용한 뒤 다시 시도해 주세요.";
    case "NotReadableError":
    case "TrackStartError":
      return "다른 프로그램이 카메라·마이크를 사용 중이에요. OBS·Zoom·카메라 앱을 닫고 다시 시도해 주세요.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "카메라·마이크 장치를 찾을 수 없어요. 연결 상태를 확인해 주세요.";
    default:
      return error?.message || "카메라와 마이크 권한을 허용해야 연습을 시작할 수 있어요.";
  }
}

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
  speech_stats: { turns: 5, total_syllables: 412, avg_speech_rate: 4.9, formal_pct: 88, measurement: { level: "표준", frames: 512, audio_sec: 163.2 } },
  deep_analysis: {
    delivery: {
      title: "말의 구조",
      rows: [
        { label: "결론 선행", value: "5번 중 4번" },
        { label: "기한 있는 약속", value: "3회" },
        { label: "책임 문형(제가 ~하겠습니다)", value: "4회" },
        { label: "모호어 밀도", value: "100음절당 0.4회" },
        { label: "구체성(숫자·수치)", value: "6회" },
        { label: "질문 정합성", value: "82%" },
      ],
      comment: "결론을 먼저 말하고 숫자로 받치는 구조가 안정적이에요. 모호어가 거의 없어 신뢰가 쌓입니다.",
      confidence: { level: "확실", n: 5 },
    },
    congruence: {
      title: "말-목소리 일치도",
      level: "언행일치",
      rows: [
        { label: "모호어 밀도(말)", value: "100음절당 0.4회" },
        { label: "목소리 떨림(jitter)", value: "0.6%" },
        { label: "문장 중간 끊김", value: "평균 0.3회" },
      ],
      comment: "내용도 단정적이고 목소리도 안정적이었어요. 내용과 전달의 확신이 같은 방향인 사람은 드뭅니다.",
      confidence: { level: "확실", n: 5 },
    },
    adaptation: {
      title: "적응 곡선",
      trend: "up",
      points: [
        { turn_order: 1, score: 74.2 }, { turn_order: 2, score: 79.5 }, { turn_order: 3, score: 84.1 },
        { turn_order: 4, score: 88.6 }, { turn_order: 5, score: 91.3 },
      ],
      comment: "후반으로 갈수록 점수가 17점 올랐어요. 압박 질문에 적응하며 안정을 찾는 전형적인 상승 곡선이에요.",
      confidence: { level: "확실", n: 5 },
    },
    moments: [
      { turn_order: 2, at_sec: 14, kinds: ["hesitation"], description: "답변 14초 지점: 일정 질문에 잠시 머뭇거렸지만 곧 구체적인 날짜로 회복했어요", quote: "아마도 다음 주쯤…" },
    ],
  },
  day_ending: { level: "high", label: "신뢰", character_id: "c1", text: "오늘 보고 덕분에 고객사 대응 방향이 잡혔어요. 이렇게 정리해서 와주면 나야 든든하죠. 내일 회의도 부탁해요." },
  rebuild: {
    turn_order: 2,
    episode_title: "업무 보고 및 피드백 논의",
    quote: "아마도 다음 주쯤에는 될 것 같은데요, 한번 확인해보고 말씀드릴게요.",
    items: [
      { label: "결론 우선 (현재 상태부터)", sentence: "결론부터 말씀드리면, 프론트엔드 구현은 다음 주 수요일까지 완료 가능합니다." },
      { label: "기한 명시 (확인 약속)", sentence: "미확정인 API 연동 일정은 오늘 오후 팀 확인 후 4시까지 다시 보고드리겠습니다." },
    ],
  },
  evidence_segments: [
    { turn_id: 1, fit_type: "eye", observed: "정면 응시 87%, 이탈 2회, 최장 이탈 1.2초 — 안정적이었어요", interpretation: "말의 신뢰도를 시선이 받쳐주고 있었어요.", suggestion: "다음 단계 도전: 핵심 문장에서 시선을 고정해 보세요." },
    { turn_id: 2, fit_type: "response", observed: "결론 선행 4/5회, 질문 정합성 82%", interpretation: "질문의 핵심 단어를 받아 말하는 습관이 자리 잡혔어요.", suggestion: "모호한 일정 표현('아마도')만 확인 약속으로 바꿔보세요." },
  ],
};
const DEMO_HISTORY = [
  { session_id: "d1", total_score: 61, started_at: "2024-04-20" },
  { session_id: "d2", total_score: 66, started_at: "2024-04-27" },
  { session_id: "d3", total_score: 71, started_at: "2024-05-04" },
  { session_id: "d4", total_score: 76, started_at: "2024-05-11" },
  { session_id: "d5", total_score: 72, started_at: "2024-05-20", fit_scores: { "Response-Fit": 72, "Voice-Fit": 68, "Eye-Fit": 78, "Posture-Fit": 82 } },
  { session_id: "d6", total_score: 88, started_at: "2024-05-24", fit_scores: { "Response-Fit": 86, "Voice-Fit": 82, "Eye-Fit": 78, "Posture-Fit": 91 } },
];
const DEMO_SESSION = { id: "demo", mode: 5, scenario: { title: "업무 보고 및 피드백 논의", description: "김서윤 팀장에게 프로젝트 중간 진행 상황을 보고하는 자리예요. 팀장은 바쁘고 직설적이라 결론부터 듣고 싶어 해요. 진행률과 지연 사유, 다음 계획을 준비해 보세요.", characters: [{ id: "kim_teamlead", name: "김서윤 팀장", role: "상사", personality: "직설적이고 바쁘다. 결론부터 듣고 싶어 한다." }] } };
const DEMO_TURN = { id: "t2", order: 2, character_id: "c1", asked_at: "02:35", question_text: "흠, 70%라면 일정보다 살짝 늦는 것 같은데요. 구체적으로 어떤 부분이 지연되고 있나요?" };
const DEMO_TURN_HISTORY = [
  { id: "t1", order: 1, character_id: "c1", asked_at: "02:31", answered_at: "02:34", question_text: "이번 프로젝트 진행 상황을 간단히 요약해주시고, 현재 가장 어려운 부분은 무엇인지 설명해 주세요.", response_text: "현재 디자인 시스템은 거의 마무리 단계이고, 프론트엔드 구현도 70% 정도 완료되었습니다..." },
];

const flow = [
  { id: "home", label: "메인" },
  { id: "role", label: "상대 역할 선택" },
  { id: "scenario", label: "시나리오 선택" },
  { id: "difficulty", label: "난이도 선택" },
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
  const [counterpartProfile, setCounterpartProfile] = useState("manager");
  const [difficulty, setDifficulty] = useState("basic");
  const mode = 5;
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
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(null);
  const [consented, setConsented] = useState(false);
  const [apiError, setApiError] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const turnAudioReferencesRef = useRef([]);
  const retainedSessionIdRef = useRef("");
  const current = flow.find((item) => item.id === active) || flow[0];
  const roleScenarioOptions = getRoleScenarioOptions(apiScenarios, counterpartProfile, mode);
  const selectedScenarioOption = roleScenarioOptions.find((item) => item.episodeId === selectedEpisodeId) || null;
  const previewScenario = apiScenarios.find((item) => item.slug === (selectedScenarioOption?.scenarioSlug || pocScenarioSlug)) || {};
  const previewEpisode = previewScenario.episodes?.find((item) => item.id === selectedEpisodeId) || null;

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
      })
      .catch(() => setApiError("서버를 실행하면 연습을 시작할 수 있어요."));
  }, []);
  useEffect(() => {
    setSelectedEpisodeId((currentId) => roleScenarioOptions.some((item) => item.episodeId === currentId) ? currentId : roleScenarioOptions[0]?.episodeId || null);
  }, [counterpartProfile, roleScenarioOptions]);
  useEffect(() => {
    const refreshHealth = () => getHealth().then(setAiHealth).catch(() => setAiHealth(null));
    refreshHealth();
    const timer = window.setInterval(refreshHealth, 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (!demo) return;
    setReport(DEMO_REPORT);
    setHistory(DEMO_HISTORY);
    if (demo === "practice") {
      setSession(DEMO_SESSION); setTurn(DEMO_TURN); setTurnHistory(DEMO_TURN_HISTORY); setTurnSignals(null); setActive("practice");
      // 데모에서도 카메라를 켜면 실시간 얼굴·자세 트래킹을 그대로 시연할 수 있어요 (거부해도 화면은 동작).
      requestExerciseMedia().catch(() => {});
    }
    else if (["result", "feedback", "compare", "share"].includes(demo)) setActive(demo);
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
          // 새로고침으로 재개된 연습도 카메라·마이크를 다시 요청해야 분석이 살아난다
          // (스트림은 페이지를 넘어 살아남지 않는다 — 이 호출이 없으면 검은 화면 + 분석 중단)
          requestExerciseMedia().catch(() => {});
        }
        if (["analyzing", "completed"].includes(resumed.status)) setActive("result");
      })
      .catch(() => localStorage.removeItem("mirror-ting-active-session"));
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
    setCounterpartProfile(profileId);
    setSelectedEpisodeId(null);
  };
  const chooseScenario = (option) => {
    setPocScenarioSlug(option.scenarioSlug);
    setSelectedEpisodeId(option.episodeId);
  };
  const requestExerciseMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState({ camera: "denied", microphone: "denied" });
      throw new Error("이 브라우저에서는 카메라와 마이크 권한을 사용할 수 없어요.");
    }
    // 이전 스트림이라도 트랙이 죽었으면(장치 분리·OS 프라이버시 토글) 새로 요청한다 —
    // 죽은 스트림을 재사용하면 검사에서 던지기만 하고 영영 복구되지 않는다
    const alive = (stream, kind) => Boolean(stream?.[kind]().some((track) => track.readyState === "live"));
    if (alive(mediaStream, "getVideoTracks") && alive(mediaStream, "getAudioTracks")) {
      setPermissionState({ camera: "granted", microphone: "granted" });
      return mediaStream;
    }
    // 카메라·마이크 합동 요청은 한쪽 고장(OBS 등 다른 앱 점유·장치 미연결)으로 전체가
    // 거부된다 — 실패하면 축별로 재시도해 살아 있는 쪽만이라도 확보한다.
    // 카메라만 되면 분석·거울은 살고, 마이크만 되면 음성 입력·녹음은 산다.
    // 지난번에 선택한 마이크가 있으면 우선 사용 (전시 PC의 빈 잭·Kinect 어레이 혼재 대응)
    const savedMic = localStorage.getItem("mirror-ting-mic-device");
    const audioConstraint = savedMic ? { deviceId: { ideal: savedMic } } : true;
    let stream = null;
    let lastError = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: audioConstraint });
    } catch (error) {
      lastError = error;
      const parts = [];
      try { parts.push(await navigator.mediaDevices.getUserMedia({ video: true })); } catch (videoError) { lastError = videoError; }
      try { parts.push(await navigator.mediaDevices.getUserMedia({ audio: audioConstraint })); } catch (audioError) { if (!parts.length) lastError = audioError; }
      const tracks = parts.flatMap((part) => part.getTracks());
      if (tracks.length) stream = new MediaStream(tracks);
    }
    const camera = alive(stream, "getVideoTracks");
    const microphone = alive(stream, "getAudioTracks");
    setPermissionState({ camera: camera ? "granted" : "denied", microphone: microphone ? "granted" : "denied" });
    if (!camera && !microphone) throw new Error(mediaErrorMessage(lastError));
    if (mediaStream && mediaStream !== stream) mediaStream.getTracks().forEach((track) => track.stop());
    setMediaStream(stream);
    return stream;
  };
  // 마이크 장치 전환 — 무음 장치(빈 잭)가 기본으로 잡히는 전시 PC 문제를 화면에서 바로 해결.
  // 비디오 트랙은 유지하고 오디오 트랙만 새 장치로 교체한 스트림을 만든다.
  const switchMicDevice = async (deviceId) => {
    const fresh = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
    localStorage.setItem("mirror-ting-mic-device", deviceId);
    const videoTracks = mediaStream?.getVideoTracks?.().filter((track) => track.readyState === "live") || [];
    mediaStream?.getAudioTracks?.().forEach((track) => track.stop());
    const next = new MediaStream([...videoTracks, ...fresh.getAudioTracks()]);
    setMediaStream(next);
    setPermissionState((prev) => ({ ...prev, microphone: "granted" }));
    return next;
  };

  const startPractice = async () => {
    setStarting(true); setApiError(""); setReport(null); setTurnHistory([]); setTurnSignals(null);
    turnAudioReferencesRef.current = [];
    retainedSessionIdRef.current = "";
    try {
      if (!consented) throw new Error("개인정보 처리에 동의하면 역할극을 시작할 수 있어요.");
      if (aiHealth?.dialogue_provider !== "ollama" || !aiHealth?.ollama?.dialogue) throw new Error("Ollama 대화 모델을 실행한 뒤 다시 시작해 주세요.");
      await requestExerciseMedia();
      const nextSession = await createSession({ difficulty, mode, scenarioSlug: previewScenario.slug, selectedEpisodeId, consent: consented });
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

  const chromeless = CHROMELESS_VIEWS.has(active);

  return <main className={`app-shell ${chromeless ? "chromeless" : ""} ${active === "practice" ? "practice-mode" : ""}`}>
    {!chromeless && <TopNav active={["preview", "practice"].includes(active) ? "role" : active} scenarioTitle={session?.scenario?.title || previewScenario?.title} sessionMode={session?.mode || mode} menuOpen={menuOpen} onMenuOpen={setMenuOpen} onNavigate={navigate} scenarios={apiScenarios} onScenarioSelect={(slug) => { setPocScenarioSlug(slug); navigate("role"); }} />}
    <MobileMenuSheet open={menuOpen} active={active} onClose={() => setMenuOpen(false)} onNavigate={navigate} />
    <div className="screen-frame">
      {active === "home" && <HomePage onNext={() => navigate("role")} />}
      {active === "role" && <RoleSelectPage counterpartProfile={counterpartProfile} onCounterpart={chooseCounterpartProfile} onPrev={() => go(-1)} onNext={() => navigate("scenario")} />}
      {active === "scenario" && <ScenarioSelectPage counterpartProfile={counterpartProfile} scenarios={apiScenarios} selectedEpisodeId={selectedEpisodeId} onScenario={chooseScenario} onPrev={() => go(-1)} onNext={() => navigate("difficulty")} />}
      {active === "difficulty" && <DifficultyPage counterpartProfile={counterpartProfile} scenario={previewScenario} difficulty={difficulty} onDifficulty={setDifficulty} onPrev={() => go(-1)} onNext={() => navigate("preview")} />}
      {active === "preview" && <PreviewPage onNext={startPractice} starting={starting} scenario={previewScenario} selectedEpisode={previewEpisode} counterpartProfile={counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1]} difficulty={difficulties.find((item) => item.id === difficulty) || difficulties[0]} aiHealth={aiHealth} consented={consented} onConsent={setConsented} error={apiError} permissionState={permissionState} mode={mode} />}
      {active === "practice" && <PracticePage onPrev={() => go(-1)} scenario={session?.scenario} aiHealth={aiHealth} turn={turn} history={turnHistory} turnSignals={turnSignals} onSubmit={sendAnswer} busy={submitting} error={apiError} mediaStream={mediaStream} onTranscribe={typeof session?.id === "number" ? (wav) => transcribeLive(session, wav) : null} onRequestMedia={requestExerciseMedia} onSwitchMic={switchMicDevice} />}
      {active === "result" && <ResultPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("feedback")} report={report} selectedDifficulty={difficulty} progress={analysisProgress} error={apiError} />}
      {active === "feedback" && <FeedbackPage onPrev={() => go(-1)} onPractice={() => navigate("preview")} onNext={() => navigate("compare")} onNavigate={navigate} report={report} />}
      {active === "compare" && <ComparePage onPrev={() => go(-1)} onRestart={() => navigate("role")} onShare={() => navigate("share")} onNavigate={navigate} history={history} report={report} />}
      {active === "share" && <SharePage onHome={() => navigate("home")} onPractice={() => navigate("role")} report={report} onIssueCode={issueCode} />}
    </div>
    <span className="screen-reader-note" aria-live="polite">현재 화면: {current.label}</span>
    <AttractLoop active={active === "home"} onStart={() => navigate("role")} />
  </main>;
}
