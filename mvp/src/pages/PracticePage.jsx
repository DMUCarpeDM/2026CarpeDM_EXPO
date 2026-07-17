import React, { useEffect, useRef, useState } from "react";
import { CheckCircle } from "reicon-react/icons/CheckCircle";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { Expand } from "reicon-react/icons/Expand";
import { InfoCircle } from "reicon-react/icons/InfoCircle";
import { LockKeyhole } from "reicon-react/icons/LockKeyhole";
import { Mic } from "reicon-react/icons/Mic";
import { Notebook } from "reicon-react/icons/Notebook";
import { Pause } from "reicon-react/icons/Pause";
import { Play } from "reicon-react/icons/Play";
import { Power } from "reicon-react/icons/Power";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Settings } from "reicon-react/icons/Settings";
import { Signal } from "reicon-react/icons/Signal";
import { User4 } from "reicon-react/icons/User4";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { LiveFitMeter } from "../components/report/Charts";
import { blobToWav } from "../lib/audioWav";
import { useFaceTracking } from "../lib/useFaceTracking";
import counterpartPortrait from "../assets/team-lead-portrait.webp";

function formatClock(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const wallClock = () => new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });

const rise = (delay) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.38, ease: [0.16, 1, 0.3, 1] },
});

export function PracticePage({ onPrev, scenario, aiHealth, turn, history, turnSignals, onSubmit, busy, error, mediaStream }) {
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const cameraRef = useRef(null);
  const chatBodyRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const stampsRef = useRef(new Map());
  const character = scenario?.characters?.find((item) => item.id === turn?.character_id) || scenario?.characters?.[0];
  const characterName = character?.name || "AI 상대";
  const coverage = turnSignals ? Math.round(turnSignals.coverage * 100) : null;
  const aiReady = aiHealth?.dialogue_provider === "ollama" && aiHealth?.ollama?.dialogue;
  // MediaPipe 실시간 얼굴·상체 트래킹 (영상 미전송 — 브라우저 안에서만 분석)
  const track = useFaceTracking(mediaStream, videoRef, overlayRef);
  const trackingLive = track.status === "ready" && track.tracking;

  // ---- 턴 단위 비언어 집계: 라이브 트래킹 샘플을 모아 백엔드 NonverbalIn으로 보낸다 ----
  // (poc의 정밀 집계 대비 경량판 — 정면 응시 비율·이탈 횟수·평균 어깨 기울기만)
  const trackRef = useRef(track);
  trackRef.current = track;
  const nonverbalRef = useRef({ frames: 0, front: 0, offCount: 0, tiltSum: 0, lastFront: true });
  useEffect(() => {
    nonverbalRef.current = { frames: 0, front: 0, offCount: 0, tiltSum: 0, lastFront: true };
  }, [turn?.id]);
  useEffect(() => {
    if (!trackingLive) return undefined;
    const timer = window.setInterval(() => {
      const sample = trackRef.current;
      if (sample.status !== "ready" || !sample.tracking) return;
      const acc = nonverbalRef.current;
      acc.frames += 1;
      if (sample.eyeFront) acc.front += 1;
      else if (acc.lastFront) acc.offCount += 1;
      acc.lastFront = sample.eyeFront;
      acc.tiltSum += sample.tiltDeg;
    }, 400);
    return () => window.clearInterval(timer);
  }, [trackingLive]);
  const buildNonverbal = () => {
    const acc = nonverbalRef.current;
    if (!acc.frames) return null;
    return {
      front_gaze_ratio: acc.front / acc.frames,
      gaze_off_count: acc.offCount,
      avg_shoulder_tilt_deg: acc.tiltSum / acc.frames,
      frames: acc.frames,
    };
  };
  const eyeMeter = trackingLive
    ? track.calibrating
      ? { percent: 30, status: "보정 중", caption: "잠시 화면을 바라봐 주세요", muted: true, warn: false }
      : track.eyeFront
        ? { percent: 92, status: "Good", caption: "상대와 눈을 맞추고 있어요", muted: false, warn: false }
        : { percent: 45, status: "주의", caption: "화면 속 상대를 바라봐 주세요", muted: false, warn: true }
    : track.status === "loading"
      ? { percent: 0, status: "…", caption: "분석 모델 준비 중", muted: true, warn: false }
      : { percent: 0, status: "–", caption: "측정 불가", muted: true, warn: false };
  const postureMeter = track.status === "ready" && track.poseTracked
    ? track.postureLevel
      ? { percent: 100, status: "Good", caption: "좋은 자세예요!", muted: false, warn: false }
      : { percent: 55, status: "주의", caption: "어깨 수평을 맞춰보세요", muted: false, warn: true }
    : track.status === "loading"
      ? { percent: 0, status: "…", caption: "분석 모델 준비 중", muted: true, warn: false }
      : { percent: 0, status: "–", caption: "측정 불가", muted: true, warn: false };
  // 목소리 게이지 — 마이크가 켜져 있으면 실측 성량으로 구동 (VoiceLevelChip이 레벨을 올려줌)
  const [voiceLevel, setVoiceLevel] = useState(null);
  const voiceMeter = voiceLevel === null
    ? { percent: 66, status: "텍스트 연습", caption: "또렷한 톤을 유지해 보세요", warn: false }
    : voiceLevel > 0.42
      ? { percent: 100, status: "너무 큼", caption: "조금만 낮춰볼까요", warn: true }
      : voiceLevel > 0.1
        ? { percent: Math.round(40 + Math.min(1, voiceLevel * 1.6) * 60), status: "적정", caption: "좋은 성량이에요!", warn: false }
        : { percent: Math.max(12, Math.round(voiceLevel * 300)), status: "조용", caption: "조금 더 크게 말해보세요", warn: false };

  // ---- AI 음성(TTS): 새 질문이 오면 AI 상대가 실제로 읽어준다 ----
  const [aiSpeaking, setAiSpeaking] = useState(false);
  useEffect(() => {
    const text = turn?.question_text;
    const synth = window.speechSynthesis;
    if (!text || !synth || paused) return undefined;
    let cancelled = false;
    const utter = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    utter.voice = voices.find((v) => v.lang?.startsWith("ko") && v.localService) || voices.find((v) => v.lang?.startsWith("ko")) || null;
    utter.lang = "ko-KR";
    utter.rate = 1.04;
    utter.onstart = () => { if (!cancelled) setAiSpeaking(true); };
    utter.onend = () => { if (!cancelled) setAiSpeaking(false); };
    utter.onerror = () => { if (!cancelled) setAiSpeaking(false); };
    synth.cancel();
    synth.speak(utter);
    return () => { cancelled = true; synth.cancel(); setAiSpeaking(false); };
  }, [turn?.id, paused]);

  // ---- 음성 답변(STT): 브라우저 음성 인식으로 말한 내용을 입력창에 받아 적는다 ----
  // AI가 말하는 동안은 마이크를 쉬어 스피커 소리가 답변으로 새는 걸 막는다.
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const recognitionRef = useRef(null);
  const sttActiveRef = useRef(false);
  const sttUsedRef = useRef(false); // 이번 턴 답변에 음성 인식이 쓰였는지 (stt_source 판별)
  const sttSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  useEffect(() => {
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    const shouldListen = Boolean(SpeechRecognitionImpl && micEnabled && mediaStream && turn && !busy && !paused && !aiSpeaking);
    if (!shouldListen) return undefined;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript.trim();
        if (!transcript) continue;
        if (event.results[i].isFinal) { sttUsedRef.current = true; setDraft((prev) => `${prev} ${transcript}`.trim()); }
        else interimText += transcript;
      }
      setInterim(interimText);
    };
    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      // 침묵으로 인식이 끊기면 다시 듣는다 (턴이 살아있는 동안)
      if (sttActiveRef.current) { try { recognition.start(); } catch { /* 이미 시작됨 */ } }
    };
    recognition.onerror = (event) => {
      // 권한 거부·오프라인이면 조용히 타이핑 모드로 폴백
      if (["not-allowed", "service-not-allowed", "network"].includes(event.error)) {
        sttActiveRef.current = false;
        setMicEnabled(false);
      }
    };
    recognitionRef.current = recognition;
    sttActiveRef.current = true;
    try { recognition.start(); } catch { /* 중복 시작 무시 */ }
    return () => {
      sttActiveRef.current = false;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* 이미 종료됨 */ }
      setListening(false);
      setInterim("");
    };
  }, [micEnabled, mediaStream, turn?.id, busy, paused, aiSpeaking, turn]);
  const inputValue = interim ? `${draft} ${interim}`.trim() : draft;

  // 메시지별 실제 시각 기록. 데모/재개 세션은 asked_at 필드나 턴 라벨로 폴백해요.
  const stampFor = (key, fallback) => stampsRef.current.get(key) || fallback;
  useEffect(() => {
    if (turn?.id && !stampsRef.current.has(`q-${turn.id}`)) stampsRef.current.set(`q-${turn.id}`, wallClock());
  }, [turn?.id]);

  // 연습 경과 시간 (상단 타이머). 일시정지하면 멈춰요.
  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused]);

  // 현재 턴의 발화 시간 (하단 "말하는 중" 타이머).
  useEffect(() => {
    setRecSeconds(0);
    if (!turn || paused) return undefined;
    const timer = window.setInterval(() => setRecSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [turn?.id, paused]);

  useEffect(() => {
    if (videoRef.current && mediaStream) videoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  // 새 메시지가 쌓이면 대화 로그를 맨 아래로 내려요.
  useEffect(() => {
    const body = chatBodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [history.length, turn?.id, busy]);

  useEffect(() => {
    if (!mediaStream || !turn) return undefined;
    if (!window.MediaRecorder) { setCaptureError("이 브라우저에서는 마이크 녹음을 시작할 수 없어요."); return undefined; }
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) { setCaptureError("마이크 권한이 필요해요."); return undefined; }
    audioChunksRef.current = [];
    recordingStartedAtRef.current = performance.now();
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(new MediaStream(audioTracks), { mimeType });
    recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
    recorderRef.current = recorder;
    recorder.start();
    setCaptureError("");
    return () => { if (recorder.state !== "inactive") recorder.stop(); };
  }, [mediaStream, turn]);

  const stopTurnRecorder = () => new Promise((resolve, reject) => {
    const recorder = recorderRef.current;
    if (!recorder) { reject(new Error("마이크 녹음이 준비되지 않았어요.")); return; }
    recorder.onstop = () => resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
    if (recorder.state === "inactive") recorder.onstop();
    else { recorder.requestData(); recorder.stop(); }
  });

  const submitDraft = async () => {
    const text = inputValue.trim();
    if (!text || busy || !turn) return;
    try {
      sttActiveRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* 이미 종료됨 */ }
      // 녹음(webm)을 서버 음성 분석이 읽을 수 있는 WAV로 변환 — 실패해도 텍스트로 진행
      const webm = await stopTurnRecorder().catch(() => null);
      const audio = webm && webm.size > 0 ? await blobToWav(webm).catch(() => null) : null;
      stampsRef.current.set(`a-${turn.id}`, wallClock());
      await onSubmit({
        text,
        audio,
        durationMs: Math.round(performance.now() - recordingStartedAtRef.current),
        sttSource: sttUsedRef.current ? "webspeech" : "text",
        nonverbal: buildNonverbal(),
      });
      sttUsedRef.current = false;
      setDraft("");
      setInterim("");
      setCaptureError("");
    } catch (err) { setCaptureError(err.message); }
  };

  const toggleCameraFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else cameraRef.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <motion.section className="practice-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <motion.header className="practice-topbar" {...rise(0)}>
        <div className="practice-topbar-left">
          <span className="brand-mark" aria-hidden="true">M</span>
          <strong className="practice-brand">Mirrorting</strong>
          <div className="topbar-item">
            <span className="topbar-item-label">시나리오</span>
            <button type="button" className="topbar-scenario">{scenario?.title || "업무 보고 및 피드백 논의"} <ChevronDown size={15} /></button>
          </div>
          <div className="topbar-item counterpart">
            <span className="counterpart-avatar"><img src={counterpartPortrait} alt="" /></span>
            <span className="counterpart-meta">
              <span className="topbar-item-label">상대</span>
              <strong>{characterName} <i className="presence-dot" aria-hidden="true" /><em className="ai-tag">AI</em></strong>
            </span>
          </div>
        </div>
        <div className="practice-topbar-right">
          <span className="practice-timer"><i className="rec-dot" aria-hidden="true" />{formatClock(elapsed)}</span>
          <button type="button" className="practice-end" onClick={onPrev}><Power size={16} /> 연습 종료</button>
          <button type="button" className="practice-settings" aria-label="설정"><Settings size={20} /></button>
        </div>
      </motion.header>

      <div className="practice-stage">
        <motion.section className="practice-camera" aria-label="연습 카메라" ref={cameraRef} {...rise(0.06)}>
          <video ref={videoRef} className={`camera-video ${mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미리보기" />
          <canvas ref={overlayRef} className="tracking-canvas" aria-hidden="true" />
          {!trackingLive && <TrackingOverlay silhouette={!mediaStream} />}
          <div className="camera-topline left">
            <span className="camera-live-chip"><b><i aria-hidden="true" />LIVE</b>AI 카메라</span>
            <span className="camera-privacy-chip"><LockKeyhole size={13} /> 영상은 이 기기 밖으로 나가지 않아요</span>
          </div>
          <div className="camera-topline right">
            <span className="camera-latency"><Signal size={14} /> {track.status === "ready" ? `${track.inferMs}ms` : "28ms"}</span>
            <button type="button" className="camera-expand" onClick={toggleCameraFullscreen} aria-label="카메라 전체 화면">
              <Expand size={15} />
            </button>
          </div>
          <VoiceLevelChip mediaStream={mediaStream} onLevel={setVoiceLevel} />
          <div className={`camera-eye-chip ${trackingLive && !track.eyeFront ? "warn" : ""}`}>
            <span className="eye-chip-title"><IconGlyph icon="coach" size={15} /> {trackingLive && !track.eyeFront ? "시선이 벗어났어요" : "시선 유지 좋음"}</span>
            <span className="eye-chip-sub"><CheckCircle size={14} /> {trackingLive && !track.eyeFront ? "화면 속 상대의 눈을 바라봐 주세요" : "상대의 눈을 바라보고 듣고 있어요!"}</span>
          </div>
          <div className="camera-subtitle">
            <div className="camera-subtitle-head">
              <span className="subtitle-avatar"><img src={counterpartPortrait} alt="" /></span>
              <strong>{characterName}</strong>
              <em className={`speaking-chip ${aiSpeaking ? "" : "calm"}`}><IconGlyph icon="response" size={13} /> {busy ? "답변 분석 중" : aiSpeaking ? "AI가 말하는 중" : listening ? "듣고 있어요" : turn ? "당신 차례예요" : "질문 준비 중"}</em>
            </div>
            <p className="subtitle-quote">
              <span className="quote-mark" aria-hidden="true">“</span>
              {turn?.question_text || "다음 질문을 준비하고 있어요."}
              <span className="quote-mark close" aria-hidden="true">”</span>
            </p>
            <span className={`subtitle-wave ${aiSpeaking ? "" : "idle"}`} aria-hidden="true">{Array.from({ length: 52 }, (_, i) => <i key={i} />)}</span>
          </div>
        </motion.section>

        <aside className="practice-side">
          <motion.section className="card live-fit-card" {...rise(0.12)}>
            <div className="live-fit-head">
              <h2><IconGlyph icon="fit" size={18} /> 실시간 4-Fit 피드백 <InfoCircle size={15} className="muted-info" /></h2>
              <button type="button" className="text-link" onClick={onPrev}>자세히 보기 <ChevronRight size={14} /></button>
            </div>
            <div className="live-fit-grid">
              <LiveFitMeter tone="response" label="응답" english="Response" kind="percent" percent={coverage} status={coverage === null ? "대기" : "Coverage"} caption={coverage === null ? "첫 답변 후 표시돼요" : coverage >= 70 ? "잘하고 있어요!" : "핵심을 더 채워보세요"} />
              <LiveFitMeter tone="voice" label="목소리" english="Voice" kind="wave" percent={voiceMeter.percent} status={voiceMeter.status} caption={voiceMeter.caption} warn={voiceMeter.warn} />
              <LiveFitMeter tone="eye" label="시선" english="Eye" kind="icon" icon="eye" percent={eyeMeter.percent} status={eyeMeter.status} caption={eyeMeter.caption} muted={eyeMeter.muted} warn={eyeMeter.warn} />
              <LiveFitMeter tone="posture" label="자세" english="Posture" kind="icon" icon="posture" percent={postureMeter.percent} status={postureMeter.status} caption={postureMeter.caption} muted={postureMeter.muted} warn={postureMeter.warn} />
            </div>
            {!aiReady && <p className="live-fit-note"><IconGlyph icon="coach" size={16} /> 기본 질문 모드로 진행 중 — Ollama 연결 시 개인화 질문이 활성화돼요.</p>}
          </motion.section>

          <motion.section className="card chat-log-card" {...rise(0.18)}>
            <div className="chat-log-head">
              <h2>대화 로그 <em className="live-label"><i aria-hidden="true" />실시간</em></h2>
              <button type="button" className="text-link">전체 보기 <ChevronRight size={14} /></button>
            </div>
            <div className="chat-log-body" ref={chatBodyRef}>
              {history.map((item) => (
                <React.Fragment key={item.id}>
                  <ChatBubble ai name={characterName} time={item.asked_at || stampFor(`q-${item.id}`, `턴 ${item.order}`)}>{item.question_text}</ChatBubble>
                  <ChatBubble mine time={item.answered_at || stampFor(`a-${item.id}`, `턴 ${item.order}`)}>{item.response_text}</ChatBubble>
                </React.Fragment>
              ))}
              {turn?.reaction_text && <ChatBubble ai name={characterName} time="AI 반응">{turn.reaction_text}</ChatBubble>}
              {turn && <ChatBubble ai name={characterName} time={turn.asked_at || stampFor(`q-${turn.id}`, `턴 ${turn.order}`)}>{turn.question_text}</ChatBubble>}
              <div className={`typing-bubble ${busy ? "busy" : ""}`} aria-label={busy ? "AI가 답을 준비하고 있어요" : "답변을 기다리고 있어요"}><i /><i /><i /></div>
              {(error || captureError) && <p className="practice-error">{error || captureError}</p>}
            </div>
          </motion.section>
        </aside>
      </div>

      {notesOpen && (
        <div className="practice-notes-pop">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="연습 중 떠오른 메모를 남겨보세요. (전송되지 않아요)" />
        </div>
      )}

      <motion.footer className="practice-controls" {...rise(0.24)}>
        <div className="controls-main">
          <button type="button" className={`control-note ${notesOpen ? "active" : ""}`} onClick={() => setNotesOpen((open) => !open)}><Notebook size={19} /> 나의 노트</button>
          <div className="control-speak">
            <button type="button" className={`control-speak-label ${listening ? "listening" : ""}`} onClick={() => setMicEnabled((value) => !value)} disabled={!sttSupported} title={sttSupported ? "음성 입력 켜기/끄기" : "이 브라우저는 음성 입력을 지원하지 않아요"}>
              <Mic size={18} /> {busy ? "분석 중..." : listening ? "듣는 중..." : !sttSupported || !micEnabled ? "직접 입력" : "말하는 중..."}
            </button>
            <span className="control-wave" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} />)}</span>
            <input value={inputValue} onChange={(event) => { setDraft(event.target.value); setInterim(""); }} onKeyDown={(event) => { if (event.key === "Enter" && inputValue.trim() && !busy && turn) submitDraft(); }} placeholder="말하면 자동으로 받아 적어요 — 직접 입력도 돼요" disabled={busy || !turn} />
            <span className="control-clock"><time>{formatClock(recSeconds)}</time><small>{formatClock(elapsed)}</small></span>
            <button type="button" className="control-send" aria-label="답변 보내기" onClick={submitDraft} disabled={busy || !inputValue.trim() || !turn}><span className="stop-square" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="controls-side">
          <button type="button" className="control-pause" onClick={() => setPaused((value) => !value)}>{paused ? <><Play size={18} /> 다시 시작</> : <><Pause size={18} /> 일시정지</>}</button>
          <button type="button" className="control-retry" onClick={() => { setDraft(""); setCaptureError(""); }}><Refresh3 size={18} /> 재시도</button>
        </div>
      </motion.footer>
    </motion.section>
  );
}

// 마이크 입력 레벨 칩. 스트림이 있으면 WebAudio 분석기로 막대·상태 태그를 실제 음량에 맞춰 움직여요.
// 스트림이 없으면(데모) 잔잔한 대기 애니메이션과 "적정" 태그를 보여줘요.
function VoiceLevelChip({ mediaStream, onLevel }) {
  const barsRef = useRef(null);
  const tagRef = useRef(null);
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;
  const hasAudio = Boolean(mediaStream?.getAudioTracks?.().length);

  useEffect(() => {
    if (!hasAudio) return undefined;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    audioContext.createMediaStreamSource(mediaStream).connect(analyser);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let lastTagUpdate = 0;
    const tick = (now) => {
      analyser.getByteFrequencyData(spectrum);
      const bars = barsRef.current?.children;
      if (bars) {
        let sum = 0;
        for (let i = 0; i < bars.length; i += 1) {
          // 사람 목소리 대역(저·중역) 위주로 샘플링해요.
          const value = spectrum[2 + Math.floor((i / bars.length) * 42)] / 255;
          sum += value;
          bars[i].style.height = `${4 + value * 14}px`;
        }
        const level = sum / bars.length;
        if (tagRef.current && now - lastTagUpdate > 350) {
          const state = level > 0.42 ? "loud" : level > 0.1 ? "ok" : "quiet";
          if (tagRef.current.dataset.state !== state) {
            tagRef.current.dataset.state = state;
            tagRef.current.textContent = state === "loud" ? "너무 큼" : state === "ok" ? "적정" : "조용";
          }
          onLevelRef.current?.(level); // 사이드 목소리 게이지도 같은 실측값으로 구동
          lastTagUpdate = now;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); audioContext.close().catch(() => {}); onLevelRef.current?.(null); };
  }, [mediaStream, hasAudio]);

  return (
    <div className="camera-voicelevel">
      <span className="voicelevel-head">음성 레벨 <b ref={tagRef} data-state={hasAudio ? "quiet" : "ok"}>{hasAudio ? "조용" : "적정"}</b></span>
      <span className={`voicewave ${hasAudio ? "live" : ""}`} ref={barsRef} aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} />)}</span>
    </div>
  );
}

// 얼굴 메시 + 상체 스켈레톤 트래킹 오버레이. 실시간 측정 중임을 보여주는 시각 효과예요.
// 카메라가 없을 때(silhouette)는 인물 실루엣과 스캔 라인까지 함께 그려 빈 화면을 채워요.
function TrackingOverlay({ silhouette = false }) {
  const facePoints = [
    [50, 12], [42, 14], [58, 14], [35, 20], [65, 20], [31, 28], [69, 28], [30, 37], [70, 37],
    [32, 46], [68, 46], [37, 53], [63, 53], [44, 58], [56, 58], [50, 60],
    [40, 30], [60, 30], [37, 25], [63, 25], [43, 25], [57, 25],
    [50, 34], [46, 40], [54, 40], [50, 42],
    [43, 49], [57, 49], [50, 47], [50, 52],
  ];
  const faceLines = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [8, 10],
    [9, 11], [10, 12], [11, 13], [12, 14], [13, 15], [14, 15],
    [18, 16], [20, 16], [19, 17], [21, 17], [16, 22], [17, 22], [16, 23], [17, 24],
    [22, 23], [22, 24], [23, 25], [24, 25], [25, 28], [23, 26], [24, 27],
    [26, 28], [27, 28], [26, 29], [27, 29], [29, 15],
    [5, 16], [6, 17], [7, 23], [8, 24], [9, 26], [10, 27], [16, 17],
  ];
  return (
    <div className="tracking-zone" aria-hidden="true">
      <svg viewBox="0 0 100 132" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="track-scan-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(94, 234, 148, 0)" />
            <stop offset="0.5" stopColor="rgba(94, 234, 148, 0.55)" />
            <stop offset="1" stopColor="rgba(94, 234, 148, 0)" />
          </linearGradient>
          <linearGradient id="track-body-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(148, 178, 224, 0.34)" />
            <stop offset="1" stopColor="rgba(84, 108, 150, 0.1)" />
          </linearGradient>
        </defs>
        {silhouette && (
          <path
            className="track-silhouette"
            d="M 50 10 C 61 10 68 20 68 33 C 68 43 64 51 58 56 L 58 63 C 78 69 93 82 96 106 L 98 132 L 2 132 L 4 106 C 7 82 22 69 42 63 L 42 56 C 36 51 32 43 32 33 C 32 20 39 10 50 10 Z"
            fill="url(#track-body-fill)"
          />
        )}
        <g className="track-corners">
          <path d="M 22 6 h -9 v 9" />
          <path d="M 78 6 h 9 v 9" />
          <path d="M 22 66 h -9 v -9" />
          <path d="M 78 66 h 9 v -9" />
        </g>
        <g className="track-face">
          {faceLines.map(([a, b], index) => <line key={index} x1={facePoints[a][0]} y1={facePoints[a][1]} x2={facePoints[b][0]} y2={facePoints[b][1]} />)}
          {facePoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="0.85" />)}
        </g>
        {silhouette && <rect className="track-scan" x="16" y="0" width="68" height="1.4" rx="0.7" fill="url(#track-scan-fill)" />}
        <g className="track-skeleton">
          <line x1="50" y1="62" x2="50" y2="79" />
          <line x1="50" y1="79" x2="10" y2="93" />
          <line x1="50" y1="79" x2="90" y2="93" />
          <line x1="10" y1="93" x2="4" y2="120" />
          <line x1="90" y1="93" x2="96" y2="120" />
          <circle cx="50" cy="79" r="1.7" /><circle cx="10" cy="93" r="1.7" /><circle cx="90" cy="93" r="1.7" />
        </g>
        <path className="track-chest" d="M 10 93 C 32 107, 68 107, 90 93" />
      </svg>
    </div>
  );
}

function ChatBubble({ children, ai = false, mine = false, name, time }) {
  if (mine) {
    return (
      <div className="chat-message mine">
        <span className="chat-meta">나 · {time}</span>
        <div className="chat-bubble">
          <span className="bubble-speaker" aria-hidden="true"><IconGlyph icon="response" size={14} /></span>
          <p>{children}</p>
          <span className="bubble-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </div>
      </div>
    );
  }
  return (
    <div className={`chat-message ${ai ? "ai" : ""}`}>
      <span className="chat-avatar" aria-hidden="true"><img src={counterpartPortrait} alt="" /></span>
      <div className="chat-content">
        <span className="chat-meta">{name} · {time}</span>
        <div className="chat-bubble"><p>{children}</p></div>
      </div>
    </div>
  );
}
