import { MirrorScenarioBriefing } from "../features/smart-mirror/components/MirrorScenarioBriefing";
import { WorkplaceMirrorSceneSimulation } from "../features/smart-mirror/components/WorkplaceMirrorSceneSimulation";
import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { Expand } from "reicon-react/icons/Expand";
import { Mic } from "reicon-react/icons/Mic";
import { Pause } from "reicon-react/icons/Pause";
import { Play } from "reicon-react/icons/Play";
import { Power } from "reicon-react/icons/Power";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { TrackingOverlay, ChatBubble } from "../components/practice/PracticePresentation";
import { CounterpartVideo } from "../components/practice/CounterpartVideo";
import { hasCharacterVideo } from "../data/characterMedia";
import cafeCounterpartBackground from "../assets/cafe-counterpart-background.png";
import { isMirrorDeployment } from "../features/smart-mirror/lib/workplaceMirrorTimeline";
import { useVoiceCalibration } from "../lib/useVoiceCalibration";
import { captureSettings, sameCapture } from "../lib/voiceCapture";
import { MicrophoneCheck } from "../components/practice/MicrophoneCheck";
import { blobToWav } from "../lib/audioWav";
import { startTurnSpeech } from "../lib/turnSpeechPlayback";
import { usePracticeTranscription } from "../lib/usePracticeTranscription";
import { useLiveCoaching } from "../lib/useLiveCoaching";
import { useFaceTracking } from "../lib/useFaceTracking";
import { PersonaFace } from "../components/ui/PersonaFace";
import { composeTurnSpeech } from "../lib/turnSpeech";
import { isWorkplaceSession, workplaceBriefing } from "../lib/workplaceTrack";
import { pickWorkplaceEmotion } from "../lib/workplaceEmotion";
import { practiceInputStatus } from "../lib/practiceInputStatus";

function formatClock(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const wallClock = () => new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });

function containDialogTab(event) {
  if (event.key !== "Tab") return;
  const buttons = event.currentTarget.querySelectorAll("button:not(:disabled)");
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

export function PracticePage({ manualTest = false, onPrev, onFinish, session, scenario, aiHealth, turn, history, turnSignals, onSubmit, busy, error, mediaStream, onRequestMedia, onSwitchMic }) {
  const mirror = isMirrorDeployment();
  const voice = useVoiceCalibration(session, mediaStream);
  const exclusionsRef = useRef([]);
  const excludeStartRef = useRef(null);
  const turnCaptureRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [audioRecording, setAudioRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const analysisVideoRef = useRef(null);
  const overlayRef = useRef(null);
  const screenRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === screenRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const chatBodyRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const stampsRef = useRef(new Map());
  const submitDraftRef = useRef(null);
  const entryMediaRequestedRef = useRef(false);
  const character = scenario?.characters?.find((item) => item.id === turn?.character_id) || scenario?.characters?.[0];
  const characterName = character?.name || "AI 상대";
  const isTeamLead = character?.id === "kim_teamlead";
  const isCafeCounterpart = scenario?.slug === "ondo-cafe-crew" && character?.id === "angry_customer";
  const hasCounterpartVideo = hasCharacterVideo(character?.id);
  // 상대 영상이 있는 경우 상대를 먼저 보여주고, 내 분석 화면으로 전환할 수 있다.
  const [stageView, setStageView] = useState("counterpart");
  const mirrorMain = !hasCounterpartVideo || stageView === "mirror";

  // 종료 오클릭 보호 — 촬영·체험 중 실수로 눌러 세션이 끊기지 않게 한 번 확인한다
  const [confirmEnd, setConfirmEnd] = useState(false);

  const workplace = isWorkplaceSession(session);
  const isWorkplaceCounterpart = workplace && hasCounterpartVideo;
  const isChromaCounterpart = (isCafeCounterpart || isWorkplaceCounterpart) && !mirrorMain;
  useEffect(() => {
    // 카페·직장대화는 AI 상대 영상을 메인, 내 카메라는 우측 상단 PIP로 둔다.
    if (isCafeCounterpart || isWorkplaceCounterpart) setStageView("counterpart");
  }, [isCafeCounterpart, isWorkplaceCounterpart]);
  const sceneBriefing = workplaceBriefing(session?.interaction);
  const [sceneBriefingOpen, setSceneBriefingOpen] = useState(workplace);
  const briefingButtonRef = useRef(null);
  const briefingDialogRef = useRef(null);
  const confirmDialogRef = useRef(null);
  useEffect(() => {
    if (workplace && turn?.episode_id) setSceneBriefingOpen(true);
  }, [workplace, turn?.episode_id]);
  // 직장대화만 카테고리 시작 때 상황 안내를 띄운다. 다른 모드는 바로 조작한다.
  const sceneOverlayOpen = !voice.open && workplace && sceneBriefingOpen && Boolean(sceneBriefing);
  const entryOverlayOpen = voice.open || sceneOverlayOpen;
  useEffect(() => {
    if (!sceneOverlayOpen || (mirror && workplace)) return undefined;
    const dialog = briefingDialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    briefingButtonRef.current?.focus();
    return () => { dialog.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [sceneOverlayOpen, mirror, workplace]);
  useEffect(() => {
    if (!confirmEnd) return undefined;
    const dialog = confirmDialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    dialog.querySelector(".confirm-stay")?.focus();
    return () => { dialog.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [confirmEnd]);
  const aiReady = Boolean(aiHealth?.dialogue_ready);
  // MediaPipe 실시간 얼굴·상체 트래킹 (영상 미전송 — 브라우저 안에서만 분석)
  const track = useFaceTracking(mediaStream, analysisVideoRef, overlayRef);
  const trackingLive = track.status === "ready" && track.tracking;

  // ---- 턴 단위 비언어 집계: 훅 내부에서 샘플 단위로 모은
  // 리치 지표(자세·손동작 지표)를 제출 시 회수한다.
  // 턴이 바뀌면 이전 턴 잔여 집계를 버려 창을 정렬한다.
  useEffect(() => {
    track.collectTurnStats?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.id]);
  const buildNonverbal = () => track.collectTurnStats?.() || null;

  // ---- AI 음성(TTS): 새 질문이 오면 AI 상대가 실제로 읽어준다 ----
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const turnSpeech = composeTurnSpeech(turn);
  const [teamLeadReaction, setTeamLeadReaction] = useState("");
  // 감정 클립이 있으면 말하기보다 우선 — 1회 재생 후 onReactionComplete로 기본말하기 복귀
  const teamLeadVideoState = workplace
    ? teamLeadReaction || (aiSpeaking ? "speaking" : "listening")
    : aiSpeaking ? "speaking" : teamLeadReaction || "listening";
  useEffect(() => {
    if (!workplace || !turn?.id) return undefined;
    // 새 대사: 문장 감정에 맞는 클립을 틀고, 없으면 기본말하기를 유지한다.
    setTeamLeadReaction(pickWorkplaceEmotion({ text: turn.question_text || "" }));
    return undefined;
  }, [workplace, turn?.id, turn?.question_text]);
  useEffect(() => {
    if (!turnSignals?.case) return undefined;
    if (isCafeCounterpart) {
      const mood = turnSignals.emotion?.state;
      if (mood === "agitated") {
        // 격앙: 6초 불만 반응 뒤 불만 듣기 영상으로 이어진다.
        setTeamLeadReaction("negative_reaction");
      } else if (mood === "displeased") {
        setTeamLeadReaction("negative");
      } else if (turnSignals.observation?.issues?.length || turnSignals.case === "risky") {
        setTeamLeadReaction("negative_reaction");
      } else {
        setTeamLeadReaction("");
      }
    } else if (workplace) {
      setTeamLeadReaction(pickWorkplaceEmotion({ text: turn?.question_text || "", turnSignals }));
    } else if (isTeamLead && ["excellent", "covered"].includes(turnSignals.case)) {
      setTeamLeadReaction("positive");
    } else if (isTeamLead && turnSignals.case === "risky") {
      setTeamLeadReaction("negative");
    } else {
      setTeamLeadReaction("");
    }
  }, [isCafeCounterpart, isTeamLead, workplace, turn?.question_text, turnSignals]);
  // TTS 진단 메시지는 세션당 한 번만 분석 로그에 남긴다 (턴마다 반복하면 소음)
  const ttsNotesRef = useRef(new Set());
  const ttsNoteOnce = (msg) => {
    if (ttsNotesRef.current.has(msg)) return;
    ttsNotesRef.current.add(msg);
    pushFeed(msg);
  };
  useEffect(() => {
    const text = turnSpeech;
    if (!text || paused || entryOverlayOpen) return undefined;
    const femaleVoice = character?.voice_gender === "female" && aiHealth?.tts_female === "iris";
    return startTurnSpeech({
      text,
      voice: character?.voice_gender === "female" ? "female" : "male",
      serverTtsReady: femaleVoice,
      onSpeakingChange: setAiSpeaking,
      onFinish: () => {}, // 질문은 음성 재생 종료 후에도 입력 패널에 유지한다.
      onNote: ttsNoteOnce,
    });
  }, [turn?.id, turnSpeech, paused, entryOverlayOpen, character?.voice_gender, aiHealth?.tts_female]);

  useEffect(() => {
    // 브리핑이 닫히는 순간 그동안 쌓인 비언어 표본을 버려 집계 창을 정렬한다
    if (!entryOverlayOpen) track.collectTurnStats?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryOverlayOpen]);

  // ---- 분석 로그 피드: 파이프라인의 실제 이벤트만 기록한다 (연출용 가짜 없음).
  // 캘리브레이션·자세 전이·STT 전사·제출 — 관람객이 "지금 뭘 재고 있는지" 그대로 본다.
  const [feed, setFeed] = useState([]);
  const feedIdRef = useRef(0);
  const pushFeed = (text) => setFeed((prev) => [...prev.slice(-4), { id: (feedIdRef.current += 1), time: wallClock(), text }]);
  const {
    listening, interim, setInterim, micEnabled, setMicEnabled, sttMode,
    clearAutoSubmit, stopBrowserRecognition, getSttSource, resetSttUsage,
  } = usePracticeTranscription({
    draft, setDraft, mediaStream, turn, busy, paused: paused || voice.textOnly, aiSpeaking, entryOverlayOpen,
    pushFeed, onAutoSubmit: () => submitDraftRef.current?.(),
  });
  const liveTip = useLiveCoaching({ session, turnId: turn?.id,
    active: listening && !busy && !paused && !aiSpeaking && !entryOverlayOpen,
    sample: () => ({ text: `${draft} ${interim}`.trim().slice(0, 4000), sttSource: "webspeech",
      durationMs: Math.max(0, Math.round(performance.now() - recordingStartedAtRef.current)),
      nonverbal: track.peekTurnStats?.() || null }),
  });
  // 마이크 트랙은 살아 있는데 신호가 0인 상태(잘못된 입력 장치·음소거) — 파형 효과가 감지해 갱신
  const [micSilent, setMicSilent] = useState(false);
  const hasCamera = Boolean(mediaStream?.getVideoTracks?.().some((item) => item.readyState === "live"));
  const hasMicrophone = Boolean(mediaStream?.getAudioTracks?.().some((item) => item.readyState === "live"));

  // 준비 화면에서 권한 요청이 끝나기 전에 연습 화면이 열린 경우도 첫 진입에서 한 번 복구한다.
  useEffect(() => {
    if (hasCamera || entryMediaRequestedRef.current || !onRequestMedia) return;
    entryMediaRequestedRef.current = true;
    onRequestMedia().catch((err) => setMediaError(err.message));
  }, [hasCamera, onRequestMedia]);
  // 실제 사용 중인 입력 장치 이름을 그대로 보여준다 — 잘못된 기본 장치(빈 잭 등)를
  // 현장에서 바로 알아볼 수 있게 (예: "Azure Kinect Microphone Array" vs "마이크(Realtek)")
  const micDeviceLabel = mediaStream?.getAudioTracks?.()[0]?.label || "";
  // 선택 가능한 마이크 목록 — 권한 획득 후에만 라벨이 채워지므로 스트림 변화에 맞춰 갱신
  const [micDevices, setMicDevices] = useState([]);
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => setMicDevices(devices.filter((device) => device.kind === "audioinput" && device.deviceId && device.deviceId !== "default" && device.deviceId !== "communications")))
      .catch(() => {});
  }, [mediaStream]);
  const pickMic = async (deviceId) => {
    if (!deviceId || !onSwitchMic) return;
    try {
      await onSwitchMic(deviceId);
      const label = micDevices.find((device) => device.deviceId === deviceId)?.label || "새 장치";
      pushFeed(`마이크 전환: ${label.slice(0, 24)}`);
    } catch {
      pushFeed("마이크 전환 실패 — 다른 장치를 선택해 보세요");
    }
  };
  const analysisTools = [
    { label: "대화 AI", detail: aiHealth?.dialogue_provider === "openai" ? "GPT-4o" : aiHealth?.dialogue_provider === "browser" ? "브라우저 엔진" : "Ollama", ready: aiReady },
    { label: "음성 인식", detail: sttMode === "webspeech" ? "브라우저 STT" : "직접 입력", ready: !voice.textOnly && sttMode !== "off" && micEnabled && hasMicrophone },
    { label: "카메라 분석", detail: "MediaPipe", ready: hasCamera && track.status === "ready" },
    { label: "마이크", detail: micSilent ? "신호 없음" : micDeviceLabel || "입력", title: micDeviceLabel, ready: hasMicrophone && !micSilent },
  ];
  const inputValue = interim ? `${draft} ${interim}`.trim() : draft;
  const inputStatus = practiceInputStatus({ busy, entryOverlayOpen, paused, turn, aiSpeaking, textOnly: voice.textOnly, sttMode, micEnabled, hasMicrophone, listening });

  useEffect(() => {
    if (trackingLive) pushFeed("Pose 33pt · Hand 21pt 실시간 추적 시작");
  }, [trackingLive]);
  useEffect(() => {
    if (track.expressionStatus === "ready") pushFeed("표정 모델 출력 수집 중 — 검증 전 참고값");
    if (track.expressionStatus === "failed") pushFeed("표정 모델을 실행하지 못했습니다. 자세·음성 분석은 계속됩니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.expressionStatus]);
  useEffect(() => {
    if (track.status !== "ready" || !track.tracking) return;
    pushFeed(track.calibrating ? "개인 기준 캘리브레이션 — 편한 자세를 유지해 주세요 (~2초)" : "캘리브레이션 완료 — 기준 대비 상대 판정 시작");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.calibrating, track.status]);

  useEffect(() => {
    if (!trackingLive || track.calibrating || !track.poseTracked) return;
    pushFeed(track.postureLevel ? "어깨 수평 회복" : "자세 기울어짐 감지");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.postureLevel]);
  useEffect(() => {
    if (aiSpeaking) pushFeed("AI 질문 발화");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSpeaking]);
  useEffect(() => {
    // 제출 직후 서버의 실시간 응답 판정(Response-Fit 경량 신호)을 그대로 보여준다
    if (!turnSignals?.case) return;
    const label = {
      excellent: "핵심 요소 충실 — 훌륭한 답변",
      covered: "핵심 요소 포함",
      missing: "핵심 요소 일부 누락",
      short: "답변이 짧아요",
      risky: "위험 표현 감지",
    }[turnSignals.case] || turnSignals.case;
    const coverage = Number.isFinite(turnSignals.coverage) ? ` (커버리지 ${Math.round(turnSignals.coverage * 100)}%)` : "";
    pushFeed(`응답 판정: ${label}${coverage}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnSignals]);

  // ---- 마이크 실파형: 장식이던 입력창 옆 30개 막대를 AnalyserNode 실측으로 구동한다.
  // 막대가 목소리에 반응하면 "마이크가 실제로 듣고 있다"는 게 즉시 눈에 보인다.
  // 동시에 무음 감시: 트랙은 살아 있는데 신호가 계속 0이면(잘못된 기본 입력 장치·
  // 하드웨어 음소거) 사람이 알아챌 수 있게 경고를 띄운다 — STT가 "조용히" 죽는 최다 원인.
  const waveRef = useRef(null);
  useEffect(() => {
    if (!hasMicrophone || !mediaStream) { setMicSilent(false); return undefined; }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;
    const audioCtx = new AudioContextClass();
    void audioCtx.resume?.().catch(() => {});
    // 브라우저 정책상 사용자 제스처 전에는 AudioContext가 suspended일 수 있다 — 첫 클릭에서 재개
    const resumeOnGesture = () => { void audioCtx.resume?.().catch(() => {}); };
    document.addEventListener("pointerdown", resumeOnGesture, { once: true });
    const source = audioCtx.createMediaStreamSource(new MediaStream(mediaStream.getAudioTracks()));
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64; // 32 빈 — 막대 30개와 1:1에 가깝게
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let lastSignalAt = performance.now();
    let warned = false;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let peak = 0;
      const bars = waveRef.current?.children;
      for (let i = 0; i < data.length; i += 1) { if (data[i] > peak) peak = data[i]; }
      if (bars) {
        for (let i = 0; i < bars.length; i += 1) {
          bars[i].style.transform = `scaleY(${Math.max(0.18, (data[i % data.length] / 255) * 2.4)})`;
        }
      }
      const now = performance.now();
      // 컨텍스트가 잠들어 있으면 데이터가 전부 0이라 판단 불가 — 무음으로 오인하지 않는다
      if (audioCtx.state !== "running") lastSignalAt = now;
      if (peak > 10) {
        lastSignalAt = now;
        if (warned) { warned = false; setMicSilent(false); pushFeed("마이크 신호 회복"); }
      } else if (!warned && now - lastSignalAt > 6000) {
        // 6초 동안 완전 무신호 — 환경 소음조차 0이면 장치가 죽어 있는 것
        warned = true;
        setMicSilent(true);
        pushFeed("마이크 신호 없음 — Windows 입력 장치·음소거를 확인하세요");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", resumeOnGesture);
      source.disconnect();
      void audioCtx.close();
      setMicSilent(false);
    };
  }, [mediaStream, hasMicrophone]);

  // 메시지별 실제 시각 기록. 데모/재개 세션은 asked_at 필드나 턴 라벨로 폴백해요.
  const stampFor = (key, fallback) => stampsRef.current.get(key) || fallback;
  useEffect(() => {
    if (turn?.id && !stampsRef.current.has(`q-${turn.id}`)) stampsRef.current.set(`q-${turn.id}`, wallClock());
  }, [turn?.id]);

  // 연습 경과 시간 (상단 타이머). 일시정지·브리핑 중에는 멈춰요.
  useEffect(() => {
    if (paused || entryOverlayOpen) return undefined;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused, entryOverlayOpen]);

  // 현재 턴의 발화 시간 (하단 "말하는 중" 타이머).
  useEffect(() => {
    setRecSeconds(0);
    if (!turn || paused || entryOverlayOpen) return undefined;
    const timer = window.setInterval(() => setRecSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [turn?.id, paused, entryOverlayOpen]);

  useEffect(() => {
    // AI 상대 영상을 크게 볼 때도 분석용 비디오는 숨긴 채 계속 유지한다.
    if (analysisVideoRef.current && mediaStream) analysisVideoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  // 새 메시지가 쌓이면 대화 로그를 맨 아래로 내려요.
  useEffect(() => {
    const body = chatBodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [history.length, turn?.id, busy]);

  useEffect(() => {
    if (!mediaStream || !turn || entryOverlayOpen || voice.textOnly) return undefined;
    if (!window.MediaRecorder) { setCaptureError("이 브라우저에서는 마이크 녹음을 시작할 수 없어요."); return undefined; }
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) { setCaptureError("마이크 권한이 필요해요."); return undefined; }
    audioChunksRef.current = [];
    recordingStartedAtRef.current = performance.now();
    turnCaptureRef.current = captureSettings(mediaStream);
    exclusionsRef.current = [];
    excludeStartRef.current = (aiSpeaking || paused) ? 0 : null;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(new MediaStream(audioTracks), { mimeType });
    recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
    recorderRef.current = recorder;
    recorder.onerror = () => { setAudioRecording(false); setCaptureError("마이크 녹음이 중단됐어요."); };
    recorder.start();
    setAudioRecording(recorder.state === "recording");
    setCaptureError("");
    return () => { setAudioRecording(false); if (recorder.state !== "inactive") recorder.stop(); };
  }, [mediaStream, turn, entryOverlayOpen, voice.textOnly]);

  useEffect(() => {
    if (!voice.enabled || !recorderRef.current || recorderRef.current.state === "inactive") return;
    const now = Math.max(0, (performance.now() - recordingStartedAtRef.current) / 1000);
    if (aiSpeaking || paused) {
      if (excludeStartRef.current === null) excludeStartRef.current = now;
    } else if (excludeStartRef.current !== null) {
      if (now > excludeStartRef.current) exclusionsRef.current.push([excludeStartRef.current, now]);
      excludeStartRef.current = null;
    }
  }, [aiSpeaking, paused, voice.enabled, turn?.id, entryOverlayOpen]);

  const stopTurnRecorder = () => new Promise((resolve, reject) => {
    const recorder = recorderRef.current;
    if (!recorder) { reject(new Error("마이크 녹음이 준비되지 않았어요.")); return; }
    recorder.onstop = () => { setAudioRecording(false); resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })); };
    if (recorder.state === "inactive") recorder.onstop();
    else { recorder.requestData(); recorder.stop(); }
  });

  // ---- 미디어 재연결: 실패 원인(권한 차단·다른 앱 점유·장치 없음)을 화면에 그대로 보여준다
  const [mediaError, setMediaError] = useState("");
  const retryMedia = async () => {
    try {
      setMediaError("");
      await onRequestMedia?.();
      pushFeed("카메라·마이크 연결 재시도 성공");
    } catch (err) {
      setMediaError(err.message);
    }
  };
  const mediaHint = mediaError
    ? { error: true, text: mediaError }
    : { error: false, text: "안 되면 주소창의 카메라 아이콘에서 허용 후 다시 눌러 주세요" };

  const submitDraft = async () => {
    const text = inputValue.trim();
    if (!text || busy || paused || !turn || entryOverlayOpen) return;
    try {
      clearAutoSubmit();
      stopBrowserRecognition();
      // 녹음(webm)을 서버 음성 분석이 읽을 수 있는 WAV로 변환 — 실패해도 텍스트로 진행
      const endSeconds = Math.max(0, (performance.now() - recordingStartedAtRef.current) / 1000);
      if (excludeStartRef.current !== null && endSeconds > excludeStartRef.current) exclusionsRef.current.push([excludeStartRef.current, endSeconds]);
      excludeStartRef.current = null;
      const webm = voice.textOnly ? null : await stopTurnRecorder().catch(() => null);
      const audio = webm && webm.size > 0 ? await blobToWav(webm).catch(() => null) : null;
      stampsRef.current.set(`a-${turn.id}`, wallClock());
      pushFeed("답변 제출 — 응답·음성·비언어 지표 서버 분석");
      await onSubmit({
        text,
        audio,
        voiceInput: voice.enabled ? {
          calibration_id: voice.calibration?.id || null,
          capture: sameCapture(turnCaptureRef.current, captureSettings(mediaStream)) ? turnCaptureRef.current : null,
          excluded_intervals: exclusionsRef.current.filter(([a, b]) => a < b && b <= 120),
        } : undefined,
        durationMs: Math.round(performance.now() - recordingStartedAtRef.current),
        sttSource: getSttSource(),
        nonverbal: buildNonverbal(),
      });
      resetSttUsage();
      setDraft("");
      setInterim("");
      setCaptureError("");
    } catch (err) { setCaptureError(err.message); }
  };
  submitDraftRef.current = submitDraft;

  const toggleCameraFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else screenRef.current?.requestFullscreen?.().catch(() => {});
  };

  if (mirror && workplace) return <>
    <div className="simulation-capture" aria-hidden="true"><video ref={analysisVideoRef} autoPlay muted playsInline /><canvas ref={overlayRef} /></div>
    <WorkplaceMirrorSceneSimulation category={sceneBriefing?.category_id} characterId={character?.id} name={characterName} videoState={teamLeadVideoState} paused={paused || entryOverlayOpen} dialogueHidden={entryOverlayOpen} onReactionComplete={() => setTeamLeadReaction("")} waveRef={waveRef} captureStatus={{ recording: audioRecording && hasMicrophone && !captureError, audioError: Boolean(captureError), cameraReady: hasCamera && track.status === "ready", cameraStarting: hasCamera && track.status === "loading", cameraError: track.status === "failed" }}>
      <p className="simulation-dialogue-name">{characterName}</p>
      <h1 id="mirror-dialogue-title" className="simulation-dialogue-text">{sceneOverlayOpen ? sceneBriefing.situation : turnSpeech || "다음 대화를 준비하고 있어요."}</h1>
      <p className="simulation-dialogue-status" role="status">{sceneOverlayOpen ? "잠시 후 대화가 시작돼요." : inputStatus.title}</p>
      {voice.skipped && <p className="simulation-dialogue-status">목소리 기준 미확인 · 음성 입력은 계속돼요.</p>}
      {!entryOverlayOpen && <div className="simulation-answer">
        {voice.textOnly || !hasMicrophone || sttMode === "off" ? <>
          <label htmlFor="mirror-answer">답변</label><textarea id="mirror-answer" value={inputValue} disabled={busy || !turn} onChange={event => { clearAutoSubmit(); setDraft(event.target.value); setInterim(""); }} />
          <button type="button" onClick={submitDraft} disabled={busy || paused || !inputValue.trim() || !turn}>답변 보내기</button>
        </> : inputValue && <p>{inputValue}</p>}
      </div>}
      {liveTip && <p className="simulation-dialogue-status" role="status"><strong>대화 팁 · </strong>{liveTip.message}</p>}
      {manualTest && !entryOverlayOpen && <div className="simulation-answer"><button type="button" disabled={busy || !history.length} onClick={onFinish}>제출한 답변으로 결과 보기</button></div>}
      {(error || captureError || mediaError) && <p className="simulation-dialogue-status" role="alert">{error || captureError || mediaError}</p>}
    </WorkplaceMirrorSceneSimulation>
    {sceneOverlayOpen && <MirrorScenarioBriefing key={turn?.episode_id} briefing={sceneBriefing} onClose={() => setSceneBriefingOpen(false)} />}
    {voice.open && <MicrophoneCheck mirror automatic session={session} stream={mediaStream} onRequestMedia={onRequestMedia} onReady={voice.onReady} onTextOnly={voice.onTextOnly} onContinueWithoutCalibration={voice.onContinueWithoutCalibration} />}
  </>;

  return (
    <section ref={screenRef} className={`practice-screen ${paused ? "is-paused" : ""}`}>
      <h1 className="screen-reader-note">AI와 연습하기</h1>
      {liveTip && <div className="practice-live-tip" role="status" aria-live="polite"><strong>대화 팁</strong><span>{liveTip.message}</span></div>}
      <div className="practice-contextbar">
        <div className="practice-contextbar-left">
          <div className="topbar-item">
            <span className="topbar-item-label">시나리오</span>
            <strong className="topbar-scenario">{sceneBriefing?.category_label || scenario?.title || "업무 보고 및 피드백 논의"}</strong>
          </div>
          <div className="topbar-item counterpart">
            <span className="counterpart-avatar"><PersonaFace name={characterName} /></span>
            <span className="counterpart-meta">
              <span className="topbar-item-label">상대</span>
              <strong>{characterName} <i className="presence-dot" aria-hidden="true" /><em className="ai-tag">AI</em></strong>
            </span>
          </div>
        </div>
        <div className="practice-contextbar-right">
          <span className="practice-timer"><i className="rec-dot" aria-hidden="true" />{formatClock(elapsed)}</span>
          <button type="button" className="practice-utility" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? <><Play size={16} /> 연습 재개</> : <><Pause size={16} /> 일시정지</>}</button>
          <button type="button" className="practice-end" onClick={() => setConfirmEnd(true)}><Power size={16} /> {scenario?.slug === "cafe-order-taking" ? "주문 접수 완료" : "연습 종료"}</button>
        </div>
      </div>

      <div className="practice-input-status" role="status" aria-live="polite" aria-atomic="true"><strong>{inputStatus.title}</strong><span>{inputStatus.hint}</span></div>
      <div className="practice-stage">
        <section className="practice-question-panel" aria-labelledby="practice-question">
          <span className="practice-question-label">{aiSpeaking ? "AI 질문 듣는 중" : "현재 질문"}</span>
          <h2 id="practice-question">{turnSpeech || "다음 질문을 준비하고 있어요."}</h2>
        </section>
        <section
          className={`practice-camera ${isChromaCounterpart ? (isCafeCounterpart ? "is-cafe-counterpart" : "is-workplace-counterpart") : ""}`}
          style={isCafeCounterpart && !mirrorMain ? { "--counterpart-background": `url(${cafeCounterpartBackground})` } : undefined}
          aria-label={hasCounterpartVideo ? "AI 상대 반응 영상" : "연습 카메라"}
        >
          <div className={`camera-user-feed ${mirrorMain ? "is-main" : "is-pip"}`} aria-label={mirrorMain ? "내 카메라 미러" : "내 모습 미리보기"}>
            <video ref={analysisVideoRef} className={`camera-video ${mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미러" />
            <canvas ref={overlayRef} className="tracking-canvas" aria-hidden="true" />
            {!mirrorMain && <span className="camera-user-feed-label">내 모습</span>}
            {!mirrorMain && !hasCamera && onRequestMedia && <button type="button" className="camera-pip-connect" onClick={retryMedia}>카메라 연결</button>}
          </div>
          {mirrorMain ? <>
            {!trackingLive && <TrackingOverlay silhouette={!mediaStream} />}
            {!hasCamera && onRequestMedia && <div className="camera-reconnect">
              <button type="button" onClick={retryMedia}>{hasMicrophone ? "카메라 연결" : "카메라·마이크 연결"}</button>
              <small className={mediaHint.error ? "is-error" : ""}>{mediaHint.text}</small>
            </div>}
          </> : <>
            <CounterpartVideo characterId={character?.id} state={teamLeadVideoState} name={characterName} paused={paused} onReactionComplete={() => setTeamLeadReaction(isCafeCounterpart ? "negative" : "")} />
          </>}
          <div className="camera-topline left">
            <span className="camera-live-chip"><b><i aria-hidden="true" />LIVE</b>{mirrorMain ? "내 모습 분석" : "AI 상대"}</span>
          </div>
          <div className="camera-topline right">
            {hasCounterpartVideo && <button type="button" className="camera-expand camera-swap" onClick={() => setStageView(mirrorMain ? "counterpart" : "mirror")}>{mirrorMain ? "상대 크게" : "내 분석 크게"}</button>}
            <button type="button" className="camera-expand" onClick={toggleCameraFullscreen} aria-label={fullscreen ? "전체 화면 닫기" : "연습 전체 화면"} aria-pressed={fullscreen}>
              <Expand size={15} />
            </button>
          </div>
          {turn && <div className="camera-dialogue">
            <div className="control-speak">
              <button type="button" className={`control-speak-label ${listening ? "listening" : ""}`} onClick={() => setMicEnabled((value) => !value)} disabled={sttMode === "off" || !hasMicrophone || voice.textOnly} aria-label="음성 입력" aria-pressed={sttMode !== "off" && hasMicrophone && !voice.textOnly && micEnabled} title="음성 인식 입력을 켜거나 꺼요. 마이크 녹음 설정은 바뀌지 않아요.">
                <Mic size={18} /> 음성 입력 {sttMode !== "off" && hasMicrophone && !voice.textOnly && micEnabled ? "켜짐" : "꺼짐"}
              </button>
              <span className={`control-wave ${listening ? "is-listening" : ""} ${hasMicrophone ? "is-real" : ""}`} ref={waveRef} aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} />)}</span>
              <span className="control-clock"><time>{formatClock(recSeconds)}</time><small>{formatClock(elapsed)}</small></span>
            </div>
          </div>}
        </section>

        <aside className="practice-side">
          <section className="practice-answer-panel" aria-labelledby="practice-question">
            <label htmlFor="practice-answer">답변 입력</label>
            <textarea id="practice-answer" value={inputValue} onChange={(event) => { clearAutoSubmit(); setDraft(event.target.value); setInterim(""); }} placeholder="답변을 입력하세요" disabled={busy || !turn} />
            <div className="practice-answer-actions">
              <button type="button" className="control-send" onClick={submitDraft} disabled={busy || paused || entryOverlayOpen || !inputValue.trim() || !turn}><span>전송</span><ChevronRight size={16} aria-hidden="true" /></button>
              <button type="button" className="practice-utility" disabled={busy || !inputValue} onClick={() => { clearAutoSubmit(); setDraft(""); setInterim(""); setCaptureError(""); }}><Refresh3 size={16} /> 입력 지우기</button>
            </div>
            {(error || captureError) && <p className="practice-error" role="alert">{error || captureError}</p>}
          </section>
          <details className="practice-disclosure">
            <summary>분석 도구 연결 상태</summary>
          <section className="card tool-status-card">
            <div className="tool-status-head">
              <div><h2>분석 도구 연결 상태</h2><p>현재 연습에 사용할 도구예요.</p></div>
            </div>
            <div className="tool-status-list">
              {analysisTools.map((tool) => <div className={`tool-status-row ${tool.ready ? "ready" : "waiting"}`} key={tool.label} title={tool.title || undefined}>
                <span className="tool-status-copy"><strong>{tool.label}</strong><small>{tool.detail}</small></span>
                <span className="tool-status-state" aria-label={`${tool.label} ${tool.ready ? "켜짐" : "꺼짐"}`}><i aria-hidden="true" /><b>{tool.ready ? "ON" : "OFF"}</b></span>
              </div>)}
            </div>
            {voice.enabled && <p className="voice-check__note">{voice.textOnly ? "이번 연습은 목소리 분석 없이 진행해요." : "목소리 측정값은 종료 후 보고서에서 확인해요."}
              {voice.textOnly && <button type="button" className="text-link" onClick={voice.onRetry}>마이크 다시 확인</button>}
            </p>}
            {micDevices.length > 1 && onSwitchMic && <label className={`mic-picker ${micSilent ? "is-warn" : ""}`}>
              <span>{micSilent ? "마이크 무음 — 다른 장치 선택" : "마이크 장치"}</span>
              <select value={mediaStream?.getAudioTracks?.()[0]?.getSettings?.().deviceId || ""} onChange={(event) => pickMic(event.target.value)}>
                {!mediaStream?.getAudioTracks?.().length && <option value="">장치를 선택하세요</option>}
                {micDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "마이크"}</option>)}
              </select>
            </label>}
          </section>
          </details>

          <details className="practice-disclosure">
            <summary>대화 기록 <span>{history.length}개 답변</span></summary>
          <section className="card chat-log-card">
            <div className="chat-log-head">
              <h2>대화 로그 <em className="live-label"><i aria-hidden="true" />실시간</em></h2>
            </div>
            <div className="chat-log-body" ref={chatBodyRef}>
              {history.map((item) => (
                <React.Fragment key={item.id}>
                  <ChatBubble ai name={characterName} time={item.asked_at || stampFor(`q-${item.id}`, `턴 ${item.order}`)}>{item.question_text}</ChatBubble>
                  <ChatBubble mine time={item.answered_at || stampFor(`a-${item.id}`, `턴 ${item.order}`)}>{item.response_text}</ChatBubble>
                </React.Fragment>
              ))}
              {turn && <ChatBubble ai name={characterName} time={turn.asked_at || stampFor(`q-${turn.id}`, `턴 ${turn.order}`)}>{turn.question_text}</ChatBubble>}
              {busy && <div className="typing-bubble busy" aria-hidden="true"><i /><i /><i /></div>}
            </div>
          </section>
          </details>
        </aside>
      </div>

      {voice.open && <MicrophoneCheck automatic={mirror} session={session} stream={mediaStream} onRequestMedia={onRequestMedia} onReady={voice.onReady} onTextOnly={voice.onTextOnly} />}
      {sceneOverlayOpen && <dialog ref={briefingDialogRef} className="practice-briefing" aria-label="상황 안내" onKeyDown={containDialogTab} onCancel={() => setSceneBriefingOpen(false)}>
        <div className="practice-briefing-card practice-briefing-card--scene">
          <span className="briefing-kicker">{sceneBriefing.step} / {sceneBriefing.total} · {sceneBriefing.category_label}</span>
          <h2>{sceneBriefing.title}</h2>
          <p className="briefing-situation">{sceneBriefing.situation}</p>
          {sceneBriefing.tip && <div className="briefing-tip" role="note"><strong>TIP</strong><span>{sceneBriefing.tip}</span></div>}
          <div className="briefing-foot">
            {mirror ? <p role="status">상황 안내 후 대화가 자동으로 시작돼요.</p> : <button ref={briefingButtonRef} type="button" onClick={() => setSceneBriefingOpen(false)}>대화 시작</button>}
          </div>
        </div>
      </dialog>}

      {confirmEnd && <dialog ref={confirmDialogRef} className="practice-briefing practice-confirm" aria-label="연습 종료 확인" onKeyDown={containDialogTab} onCancel={() => setConfirmEnd(false)}>
        <div className="practice-briefing-card">
          <span className="briefing-kicker">확인</span>
          <h2>{scenario?.slug === "cafe-order-taking" ? "주문 접수를 완료할까요?" : "연습을 종료할까요?"}</h2>
          <p className="briefing-situation">지금까지 제출한 답변으로 결과를 확인합니다. 남은 질문과 목표는 완료 처리하지 않아요.</p>
          <div className="briefing-foot confirm-foot">
            <button type="button" className="confirm-stay" onClick={() => setConfirmEnd(false)}>계속 연습</button>
            <button type="button" className="confirm-leave" disabled={busy} onClick={() => { setConfirmEnd(false); (onFinish || onPrev)(); }}>연습 종료</button>
          </div>
        </div>
      </dialog>}

    </section>
  );
}
