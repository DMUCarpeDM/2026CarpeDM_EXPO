import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { InfoCircle } from "reicon-react/icons/InfoCircle";
import { Mic } from "reicon-react/icons/Mic";
import { Notebook } from "reicon-react/icons/Notebook";
import { Pause } from "reicon-react/icons/Pause";
import { Play } from "reicon-react/icons/Play";
import { Record } from "reicon-react/icons/Record";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Send } from "reicon-react/icons/Send";
import { Settings } from "reicon-react/icons/Settings";
import { User4 } from "reicon-react/icons/User4";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { LiveFitMeter } from "../components/report/Charts";

function formatClock(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function PracticePage({ onPrev, scenario, aiHealth, turn, history, turnSignals, onSubmit, busy, error, mediaStream, onReconnectMedia, onEnd }) {
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const character = scenario?.characters?.find((item) => item.id === turn?.character_id) || scenario?.characters?.[0];
  const characterName = character?.name || "AI 상대";
  const characterRole = character?.role || scenario?.title || "AI 역할극";
  const coverage = turnSignals ? Math.round(turnSignals.coverage * 100) : null;
  const aiReady = aiHealth?.dialogue_provider === "ollama" && aiHealth?.ollama?.dialogue;
  const aiState = aiReady ? "Ollama 개인화" : "기본 질문 모드";

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
      await onSubmit({ text: draft, audio, durationMs: Math.round(performance.now() - recordingStartedAtRef.current), nonverbalMetrics: collectNonverbalMetrics() });
      setDraft("");
      setCaptureError("");
    } catch (err) { setCaptureError(err.message); }
  };

  return (
    <motion.section className="practice-screen" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
      <header className="practice-topbar">
        <div className="practice-topbar-left">
          <span className="brand-mark" aria-hidden="true">M</span>
          <strong className="practice-brand">Mirrorting</strong>
          <nav className="practice-breadcrumb" aria-label="현재 위치"><span>대시보드</span><ChevronRight size={14} /><span>{characterRole}</span><ChevronRight size={14} /><span className="current">실시간 연습</span></nav>
        </div>
        <div className="practice-topbar-right">
          <span className="counterpart-chip"><span className="counterpart-avatar" aria-hidden="true"><User4 size={18} /></span>{characterName}<b>+AI</b></span>
          <span className="practice-timer"><i className="rec-dot" aria-hidden="true" />{formatClock(elapsed)}</span>
          <button type="button" className="practice-end" onClick={onEnd || onPrev}><Record size={16} /> 연습 종료</button>
          <button type="button" className="practice-settings" aria-label="설정"><Settings size={20} /></button>
        </div>
      </header>

      <div className="practice-stage">
        <section className="practice-camera" aria-label="연습 카메라">
          <video ref={videoRef} className={`camera-video ${mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미리보기" />
          {!mediaStream && <span className="camera-fallback"><User4 size={96} /></span>}
          <TrackingOverlay />
          <span className="camera-badge live"><i />LIVE</span>
          <span className="camera-badge ai-cam">AI 카메라</span>
          <span className="camera-eye-chip"><IconGlyph icon="eye" size={16} /> 시선 유지 좋음</span>
          <div className="camera-voicewave" aria-hidden="true"><span>응답 배열</span><span className="voicewave">{Array.from({ length: 22 }, (_, i) => <i key={i} />)}</span></div>
          <div className="camera-subtitle">
            <span className="camera-subtitle-head"><IconGlyph icon="coach" size={18} /> {characterName}<em>{aiReady ? "AI가 말하는 중" : "질문 준비 중"}</em></span>
            <p>{turn?.question_text || "다음 질문을 준비하고 있어요."}</p>
          </div>
        </section>

        <aside className="practice-side">
          <section className="card live-fit-card">
            <div className="live-fit-head"><h2><IconGlyph icon="fit" size={19} /> 실시간 4-Fit 피드백 <InfoCircle size={16} className="muted-info" /></h2><button type="button" className="text-link" onClick={onPrev}>자세히 보기 <ChevronRight size={14} /></button></div>
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
          {!mediaStream && onReconnectMedia ? (
            <button type="button" className="control-media-reconnect" onClick={onReconnectMedia}>
              <Mic size={18} /> 마이크·카메라 연결하기
            </button>
          ) : (
          <span className="control-speak-label"><Mic size={18} /> {busy ? "AI가 답을 준비하고 있어요" : "말하면서 답변을 입력해 주세요"}</span>
          )}
          <span className="control-wave" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <i key={i} />)}</span>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim() && !busy && turn) submitDraft(); }} placeholder="메시지를 입력해 보세요" disabled={busy || !turn} />
          <time>{formatClock(recSeconds)}</time>
          <button type="button" className="control-send" aria-label="답변 보내기" onClick={submitDraft} disabled={busy || !draft.trim() || !turn}><Send size={22} /></button>
        </div>
        <button type="button" className="control-pause" onClick={() => setPaused((value) => !value)}>{paused ? <><Play size={18} /> 다시 시작</> : <><Pause size={18} /> 일시정지</>}</button>
        <button type="button" className="control-retry" onClick={() => { setDraft(""); setCaptureError(""); }}><Refresh3 size={18} /> 재시도</button>
      </footer>
    </motion.section>
  );
}

// 얼굴·자세 트래킹 오버레이. 실시간 측정 중임을 보여주는 시각 효과예요.
function TrackingOverlay() {
  const facePoints = [
    [50, 30], [46, 33], [54, 33], [42, 37], [58, 37], [44, 42], [50, 42], [56, 42],
    [46, 47], [54, 47], [48, 51], [52, 51], [50, 55], [43, 34], [57, 34], [40, 45], [60, 45],
  ];
  return (
    <svg className="tracking-overlay" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g className="track-skeleton">
        <line x1="35" y1="72" x2="65" y2="72" />
        <line x1="50" y1="56" x2="50" y2="82" />
        <line x1="35" y1="72" x2="27" y2="92" />
        <line x1="65" y1="72" x2="73" y2="92" />
        <line x1="50" y1="56" x2="35" y2="72" />
        <line x1="50" y1="56" x2="65" y2="72" />
        <circle cx="35" cy="72" r="1.6" /><circle cx="65" cy="72" r="1.6" />
        <circle cx="50" cy="56" r="1.6" /><circle cx="27" cy="92" r="1.6" /><circle cx="73" cy="92" r="1.6" />
      </g>
      <g className="track-face">
        <rect x="38" y="24" width="24" height="34" rx="12" />
        {facePoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="0.8" />)}
      </g>
    </svg>
  );
}

function ChatBubble({ children, ai = false, mine = false, time }) {
  return <div className={`chat-message ${ai ? "ai" : ""} ${mine ? "mine" : ""}`}>{ai && <span className="ai-badge">AI</span>}<div><p>{children}</p><time>{time}</time></div></div>;
}
