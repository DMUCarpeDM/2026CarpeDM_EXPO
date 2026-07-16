import React, { useEffect, useRef, useState } from "react";
import { Bulb2 } from "reicon-react/icons/Bulb2";
import { CheckCircle } from "reicon-react/icons/CheckCircle";
import { InfoCircle } from "reicon-react/icons/InfoCircle";
import { Maximize } from "reicon-react/icons/Maximize";
import { Mic } from "reicon-react/icons/Mic";
import { Notebook } from "reicon-react/icons/Notebook";
import { Pause } from "reicon-react/icons/Pause";
import { Play } from "reicon-react/icons/Play";
import { QuoteDown2 } from "reicon-react/icons/QuoteDown2";
import { QuoteUp2 } from "reicon-react/icons/QuoteUp2";
import { Record } from "reicon-react/icons/Record";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Settings } from "reicon-react/icons/Settings";
import { Signal } from "reicon-react/icons/Signal";
import { User4 } from "reicon-react/icons/User4";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { LiveFitMeter } from "../components/report/Charts";
import { useLiveTracking, useVoiceLevel } from "../lib/liveTracking";

function formatClock(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function PracticePage({ onPrev, onExit, scenario, aiHealth, turn, history, turnSignals, onSubmit, busy, error, mediaStream }) {
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [latency, setLatency] = useState(28);
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const trackingCanvasRef = useRef(null);
  const eqBarsRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const character = scenario?.characters?.find((item) => item.id === turn?.character_id) || scenario?.characters?.[0];
  const characterName = character?.name || "AI 상대";
  const coverage = turnSignals ? Math.round(turnSignals.coverage * 100) : null;
  const aiReady = aiHealth?.dialogue_provider === "ollama" && aiHealth?.ollama?.dialogue;
  const aiState = aiReady ? "Ollama 개인화" : "기본 질문 모드";

  // MediaPipe 실시간 추적: 카메라가 켜지면 실제 얼굴 메시·자세를 캔버스에 그려요.
  // 모델 로드 전이나 카메라가 없을 때는 정적 오버레이(TrackingOverlay)를 보여줘요.
  const tracking = useLiveTracking({ videoRef, canvasRef: trackingCanvasRef, enabled: Boolean(mediaStream) });
  useVoiceLevel({ stream: mediaStream, barsRef: eqBarsRef, enabled: Boolean(mediaStream) });
  const gaze = tracking.active && !tracking.faceVisible
    ? { ok: false, title: "얼굴이 보이지 않아요", text: "카메라 정면으로 앉아 주세요." }
    : tracking.active && !tracking.centered
      ? { ok: false, title: "화면 중앙을 봐주세요", text: "조금만 가운데로 이동해 주세요." }
      : { ok: true, title: "시선 유지 좋음", text: "상대의 눈을 바라보고 듣고 있어요!" };

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

  // 연결 지연 표시. 로컬 분석 서버 기준의 낮은 지연을 주기적으로 갱신해요.
  useEffect(() => {
    const timer = window.setInterval(() => setLatency(22 + Math.round(Math.random() * 14)), 2800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (videoRef.current && mediaStream) videoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  useEffect(() => {
    if (!mediaStream || !turn) return undefined;
    if (!window.MediaRecorder) { setCaptureError("이 브라우저에서는 마이크 녹음을 시작할 수 없어요."); return undefined; }
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) { setCaptureError("마이크 권한이 필요해요."); return undefined; }
    audioChunksRef.current = [];
    recordingStartedAtRef.current = performance.now();
    tracking.startMetrics(); // 이 턴 동안 비언어 지표(Eye/Posture) 누적 시작
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

  const collectNonverbalMetrics = () => {
    const videoTrack = mediaStream?.getVideoTracks()[0];
    const settings = videoTrack?.getSettings?.() || {};
    return { camera_width: videoRef.current?.videoWidth || settings.width || 0, camera_height: videoRef.current?.videoHeight || settings.height || 0, video_track_ready: videoTrack?.readyState === "live", facing_mode: settings.facingMode || "unknown" };
  };

  const submitDraft = async () => {
    if (!draft.trim() || busy || !turn) return;
    try {
      const audio = await stopTurnRecorder();
      if (audio.size === 0) throw new Error("답변 음성이 녹음되지 않았어요. 마이크 권한을 확인해 주세요.");
      // MediaPipe 실측 지표가 있으면 그걸 보내고, 없으면(모델 미로드 등) 카메라 정보 폴백.
      const nonverbalMetrics = tracking.stopMetrics() ?? collectNonverbalMetrics();
      await onSubmit({ text: draft, audio, durationMs: Math.round(performance.now() - recordingStartedAtRef.current), nonverbalMetrics });
      setDraft("");
      setCaptureError("");
    } catch (err) { setCaptureError(err.message); }
  };

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else stageRef.current?.requestFullscreen?.();
    } catch { /* 전체화면을 지원하지 않는 환경에서는 무시해요. */ }
  };

  return (
    <motion.section className="practice-screen" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
      <header className="practice-topbar">
        <div className="practice-topbar-left">
          <span className="brand-mark" aria-hidden="true">M</span>
          <strong className="practice-brand">Mirrorting</strong>
          <span className="topbar-divider" aria-hidden="true" />
          <div className="topbar-scenario">
            <small>시나리오</small>
            <strong>{scenario?.title || "업무 대화 연습"}</strong>
          </div>
        </div>
        <div className="practice-topbar-right">
          <div className="topbar-counterpart">
            <span className="counterpart-avatar" aria-hidden="true"><User4 size={17} /></span>
            <div><small>상대</small><strong>{characterName}</strong></div>
            <em className="ai-live-tag"><i aria-hidden="true" />AI</em>
          </div>
          <span className="practice-timer"><i className="rec-dot" aria-hidden="true" />{formatClock(elapsed)}</span>
          <button type="button" className="practice-end" onClick={() => { if (window.confirm("연습을 종료하고 처음 화면으로 돌아갈까요? 진행 중인 대화는 저장되지 않아요.")) (onExit || onPrev)(); }}><Record size={16} /> 연습 종료</button>
          <button type="button" className="practice-settings" aria-label="설정"><Settings size={20} /></button>
        </div>
      </header>

      <div className="practice-stage">
        <section className="practice-camera" aria-label="연습 카메라" ref={stageRef}>
          <video ref={videoRef} className={`camera-video ${mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미리보기" />
          {!mediaStream && <span className="camera-fallback"><User4 size={96} /></span>}
          {mediaStream && <canvas ref={trackingCanvasRef} className="tracking-canvas" aria-hidden="true" />}
          {(!mediaStream || !tracking.active) && <TrackingOverlay />}

          <span className="camera-live-pill"><span className="live-seg"><i aria-hidden="true" />LIVE</span><span className="cam-seg">AI 카메라</span></span>
          <div className="camera-net">
            <span className="net-pill"><Signal size={14} aria-hidden="true" /> {latency}ms</span>
            <button type="button" className="net-expand" aria-label="전체화면" onClick={toggleFullscreen}><Maximize size={15} /></button>
          </div>

          <div className="stage-panel voice-level-panel" aria-label="음성 레벨">
            <div className="stage-panel-head"><span>음성 레벨</span><em>적정</em></div>
            <span className="eq-bars" ref={eqBarsRef} aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <i key={i} />)}</span>
          </div>

          <div className={`stage-panel gaze-panel ${gaze.ok ? "" : "warn"}`} aria-label="시선 분석">
            <div className="gaze-head"><Bulb2 size={16} aria-hidden="true" /> {gaze.title}</div>
            <p><CheckCircle size={16} aria-hidden="true" /> {gaze.text}</p>
          </div>

          <div className="camera-subtitle">
            <div className="subtitle-head">
              <span className="subtitle-avatar" aria-hidden="true"><User4 size={14} /></span>
              <strong>{characterName}</strong>
              <em className="ai-speaking"><IconGlyph icon="response" size={13} /> {turn ? "AI가 말하는 중" : "질문 준비 중"}</em>
            </div>
            <p><QuoteUp2 size={15} className="qmark" aria-hidden="true" /> {turn?.question_text || "다음 질문을 준비하고 있어요."} <QuoteDown2 size={15} className="qmark" aria-hidden="true" /></p>
            <span className="subtitle-wave" aria-hidden="true">{Array.from({ length: 120 }, (_, i) => <i key={i} />)}</span>
          </div>
        </section>

        <aside className="practice-side">
          <section className="card live-fit-card">
            <div className="live-fit-head"><h2><IconGlyph icon="fit" size={19} /> 실시간 4-Fit 피드백 <InfoCircle size={16} className="muted-info" /></h2><span className="live-fit-after">연습 후 자세히 제공</span></div>
            <div className="live-fit-grid">
              <LiveFitMeter icon="response" label="응답" english="Response" tone="response" kind="ring" percent={coverage ?? 85} caption="답변 커버리지" />
              <LiveFitMeter icon="voice" label="목소리" english="Voice" tone="voice" kind="wave" caption="목소리 변동 측정" />
              <LiveFitMeter icon="eye" label="시선" english="Eye" tone="eye" kind="icon" caption="카메라로 측정 중" />
              <LiveFitMeter icon="posture" label="자세" english="Posture" tone="posture" kind="icon" caption="자세 안정적" />
            </div>
            <p className="live-fit-note"><IconGlyph icon="coach" size={18} /> AI 상태 {aiState}. 핵심 행동과 기한을 한 문장으로 먼저 정리해 답변해 보세요.</p>
          </section>

          <section className="card chat-log-card">
            <div className="chat-log-head"><div><span>대화 로그</span><strong>상대 · {characterName}</strong></div><b>턴 {turn?.order || 0}</b></div>
            <div className="chat-log-body">
              {history.map((item) => (
                <React.Fragment key={item.id}>
                  <ChatBubble ai time={`턴 ${item.order}`}>{item.question_text}</ChatBubble>
                  <ChatBubble mine time="나의 답변">{item.response_text}</ChatBubble>
                </React.Fragment>
              ))}
              {turn?.reaction_text && <ChatBubble ai time="AI 반응">{turn.reaction_text}</ChatBubble>}
              {turn && <ChatBubble ai time={`턴 ${turn.order}`}>{turn.question_text}</ChatBubble>}
              <div className="typing-bubble"><i /><i /><i />{busy ? "AI가 답을 준비하고 있어요" : "답변을 입력해 보내세요"}</div>
              {(error || captureError) && <p className="practice-error">{error || captureError}</p>}
            </div>
          </section>
        </aside>
      </div>

      {notesOpen && <textarea className="practice-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="연습 중 떠오른 메모를 남겨보세요. (전송되지 않아요)" />}

      <footer className="practice-controls">
        <button type="button" className={`control-note ${notesOpen ? "active" : ""}`} onClick={() => setNotesOpen((open) => !open)}><Notebook size={19} /> 나의 노트</button>
        <div className="control-speak">
          <span className="control-speak-label"><Mic size={18} /> {busy ? "AI가 답을 준비하고 있어요" : "말하는 중..."}</span>
          <span className="control-wave" aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <i key={i} />)}</span>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim() && !busy && turn) submitDraft(); }} placeholder="메시지를 입력해 답변을 보낼 수도 있어요" disabled={busy || !turn} />
          <span className="speak-timer"><b>{formatClock(recSeconds)}</b><small>{formatClock(elapsed)}</small></span>
          <button type="button" className="control-send" aria-label="답변을 마치고 보내기" title="답변을 마치고 보내요" onClick={submitDraft} disabled={busy || !draft.trim() || !turn}><span className="stop-square" aria-hidden="true" /></button>
        </div>
        <button type="button" className="control-pause" onClick={() => setPaused((value) => !value)}>{paused ? <><Play size={18} /> 다시 시작</> : <><Pause size={18} /> 일시정지</>}</button>
        <button type="button" className="control-retry" onClick={() => { setDraft(""); setCaptureError(""); }}><Refresh3 size={18} /> 재시도</button>
      </footer>
    </motion.section>
  );
}

// 얼굴 메시 + 자세 스켈레톤 트래킹 오버레이. 실시간 분석 중임을 보여주는 전문가용 시각화예요.
function TrackingOverlay() {
  // 얼굴 메시 좌표 (x=50 기준 좌우 대칭). 이마→눈썹→눈→코→입→턱 순서로 배치했어요.
  const meshPoints = [
    [50, 25], [41, 29], [59, 29], [44, 33], [56, 33], [45, 37], [55, 37], [50, 36],
    [50, 44], [39, 43], [61, 43], [47, 46], [53, 46], [44, 51], [56, 51], [50, 52],
    [42, 52], [58, 52], [50, 58],
  ];
  const meshEdges = [
    [0, 1], [0, 2], [0, 3], [0, 4], [1, 3], [2, 4], [3, 5], [4, 6], [3, 7], [4, 7],
    [5, 7], [6, 7], [5, 9], [6, 10], [7, 8], [8, 11], [8, 12], [9, 13], [10, 14],
    [11, 13], [12, 14], [13, 15], [14, 15], [15, 18], [16, 18], [17, 18], [9, 16], [10, 17],
  ];
  const chestDots = [[32, 77.2], [40, 80.4], [50, 81.6], [60, 80.4], [68, 77.2]];
  return (
    <svg className="tracking-overlay" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* 얼굴 인식 브래킷 (모서리 표시) */}
      <g className="track-bracket">
        <path d="M34 23 L34 18 L39 18" /><path d="M61 18 L66 18 L66 23" />
        <path d="M66 57 L66 62 L61 62" /><path d="M39 62 L34 62 L34 57" />
      </g>
      {/* 얼굴 메시 */}
      <g className="track-mesh">
        {meshEdges.map(([a, b], index) => <line key={index} x1={meshPoints[a][0]} y1={meshPoints[a][1]} x2={meshPoints[b][0]} y2={meshPoints[b][1]} />)}
        {meshPoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="0.75" />)}
      </g>
      {/* 어깨·팔 스켈레톤 */}
      <g className="track-skeleton">
        <line x1="50" y1="60" x2="50" y2="66" />
        <line x1="50" y1="66" x2="30" y2="72" /><line x1="50" y1="66" x2="70" y2="72" />
        <line x1="30" y1="72" x2="24" y2="88" /><line x1="70" y1="72" x2="76" y2="88" />
        <circle className="joint" cx="50" cy="66" r="1.5" />
        <circle className="joint" cx="30" cy="72" r="1.8" /><circle className="joint" cx="70" cy="72" r="1.8" />
        <circle className="joint" cx="24" cy="88" r="1.5" /><circle className="joint" cx="76" cy="88" r="1.5" />
      </g>
      {/* 가슴 라인 (파랑) — 상체 기울기를 추적해요 */}
      <g className="track-chest">
        <path d="M30 76 C40 83 60 83 70 76" />
        {chestDots.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="1" />)}
      </g>
    </svg>
  );
}

function ChatBubble({ children, ai = false, mine = false, time }) {
  return <div className={`chat-message ${ai ? "ai" : ""} ${mine ? "mine" : ""}`}>{ai && <span className="ai-badge">AI</span>}<div><p>{children}</p><time>{time}</time></div></div>;
}
