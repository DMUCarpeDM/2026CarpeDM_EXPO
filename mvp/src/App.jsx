import { useEffect, useRef, useState } from "react";
import { counterpartProfiles, difficulties, getRoleScenarioOptions } from "./data/setupCatalog";
import { ServiceEntryShell } from "./pages/ServiceEntryShell";
import {
  buildRetainedRecord,
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
  issueCode,
  saveActiveSession,
  submitResponse,
  transcribeLive,
} from "./lib/pocApi";
import { findJobRole } from "./lib/nfc";
import { resolveServiceMode } from "./lib/serviceModeContext";
import { isKioskIssue } from "./lib/serviceEntryRoute";
import { useServiceEntryRoute } from "./lib/useServiceEntryRoute";

const KIOSK_ISSUE_MODE = isKioskIssue();

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

export default function App() {
  const [apiScenarios, setApiScenarios] = useState([]);
  const [aiHealth, setAiHealth] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [permissionState, setPermissionState] = useState({ camera: "prompt", microphone: "prompt" });
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const turnAudioReferencesRef = useRef([]);
  const retainedSessionIdRef = useRef("");

  const requestExerciseMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState({ camera: "denied", microphone: "denied" });
      throw new Error("이 브라우저에서는 카메라와 마이크 권한을 사용할 수 없어요.");
    }
    const alive = (stream, kind) => Boolean(stream?.[kind]().some((track) => track.readyState === "live"));
    if (alive(mediaStream, "getVideoTracks") && alive(mediaStream, "getAudioTracks")) {
      setPermissionState({ camera: "granted", microphone: "granted" });
      return mediaStream;
    }
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

  const entry = useServiceEntryRoute({ kioskIssueMode: KIOSK_ISSUE_MODE, requestExerciseMedia });
  const {
    active, selectedServiceModeId, counterpartProfile, difficulty,
    session, turn, report, pocScenarioSlug, selectedEpisodeId, nfcCard, consented,
  } = entry.state;
  const {
    setSession, setTurn, setTurnHistory, setTurnSignals, setReport, setHistory,
    setPocScenarioSlug, setSelectedEpisodeId, setApiError,
  } = entry.setters;
  const { navigate } = entry.actions;
  const mode = 5;
  const selectedServiceMode = resolveServiceMode(selectedServiceModeId);
  const roleScenarioOptions = getRoleScenarioOptions(apiScenarios, counterpartProfile, mode);
  const selectedScenarioOption = roleScenarioOptions.find((item) => item.episodeId === selectedEpisodeId) || null;
  const previewScenario = apiScenarios.find((item) => item.slug === (nfcCard?.scenarioSlug || selectedScenarioOption?.scenarioSlug || pocScenarioSlug)) || {};
  const previewEpisode = nfcCard ? null : previewScenario.episodes?.find((item) => item.id === selectedEpisodeId) || null;

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const load = () => {
      getScenarios()
        .then((items) => {
          if (cancelled) return;
          setApiScenarios(items);
          setPocScenarioSlug((currentSlug) => currentSlug || items[0]?.slug || "");
          setApiError("");
        })
        .catch(() => {
          if (cancelled) return;
          setApiError("서버를 실행하면 연습을 시작할 수 있어요.");
          timer = window.setTimeout(load, 5000);
        });
    };
    load();
    return () => { cancelled = true; window.clearTimeout(timer); };
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
      try {
        await requestExerciseMedia();
      } catch (mediaError) {
        console.warn("[media] 카메라·마이크 없이 시작:", mediaError?.message || mediaError);
      }
      const nextSession = await createSession({
        difficulty,
        mode,
        scenarioSlug: previewScenario.slug || nfcCard?.scenarioSlug,
        selectedEpisodeId: nfcCard ? null : selectedEpisodeId,
        jobRole: nfcCard?.jobRole,
        nfcUid: nfcCard?.uid || "",
        consent: consented,
      });
      saveActiveSession(nextSession);
      setSession(nextSession); setTurn(nextSession.current_turn); navigate("practice");
    } catch (error) { setApiError(error.message); } finally { setStarting(false); }
  };
  const sendAnswer = async (input) => {
    if (!session || !turn || !input.text.trim()) return;
    setSubmitting(true); setApiError("");
    try {
      const result = await submitResponse(session, turn.id, { ...input, text: input.text.trim() });
      void retainTurnAudio(session.id, turn.id, input.audio).then((audioReference) => {
        if (audioReference) turnAudioReferencesRef.current = [...turnAudioReferencesRef.current, audioReference];
      }).catch((error) => {
        console.warn("[audio] turn recording was not retained:", error);
      });
      setTurnHistory((items) => [...items, { ...turn, response_text: input.text.trim() }]);
      setTurnSignals(result.turn_signals || null);
      if (result.finished) { await finishSession(session); setTurn(null); navigate("result"); } else setTurn(result.next_turn);
    } catch (error) { setApiError(error.message); } finally { setSubmitting(false); }
  };

  const nfcRole = nfcCard ? findJobRole(nfcCard.jobRole) : null;
  const previewCounterpartProfile = nfcCard
    ? { image: (counterpartProfiles.find((item) => item.id === nfcRole?.counterpartProfileId) || counterpartProfiles[0]).image }
    : counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[0];
  const view = {
    serviceMode: selectedServiceMode,
    apiScenarios,
    previewScenario,
    previewEpisode,
    previewCounterpartProfile,
    difficultyOption: difficulties.find((item) => item.id === difficulty) || difficulties[0],
    aiHealth,
    permissionState,
    mediaStream,
    analysisProgress,
    starting,
    submitting,
    mode,
  };
  const actions = {
    startPractice,
    sendAnswer,
    requestExerciseMedia,
    switchMicDevice,
    transcribeLive,
    issueCode,
  };

  return <ServiceEntryShell
    entry={entry}
    kioskIssueMode={KIOSK_ISSUE_MODE}
    view={view}
    actions={actions}
  />;
}
