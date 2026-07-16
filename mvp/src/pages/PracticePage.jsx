import React, { useEffect, useRef, useState } from "react";
import { CheckCircle } from "reicon-react/icons/CheckCircle";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { Expand } from "reicon-react/icons/Expand";
import { InfoCircle } from "reicon-react/icons/InfoCircle";
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

function formatClock(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function PracticePage({ onPrev, scenario, aiHealth, turn, history, turnSignals, onSubmit, busy, error, mediaStream }) {
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const videoRef = useRef(null);
  const chatBodyRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const character = scenario?.characters?.find((item) => item.id === turn?.character_id) || scenario?.characters?.[0];
  const characterName = character?.name || "AI 상대";
  const coverage = turnSignals ? Math.round(turnSignals.coverage * 100) : null;
  const aiReady = aiHealth?.dialogue_provider === "ollama" && aiHealth?.ollama?.dialogue;

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
          <div className="topbar-item">
            <span className="topbar-item-label">시나리오</span>
            <button type="button" className="topbar-scenario">{scenario?.title || "업무 보고 및 피드백 논의"} <ChevronDown size={15} /></button>
          </div>
          <div className="topbar-item counterpart">
            <span className="counterpart-avatar" aria-hidden="true"><User4 size={17} /></span>
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
      </header>

      <div className="practice-stage">
        <section className="practice-camera" aria-label="연습 카메라">
          <video ref={videoRef} className={`camera-video ${mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미리보기" />
          {!mediaStream && <span className="camera-fallback"><User4 size={120} /></span>}
          <TrackingOverlay />
          <div className="camera-topline left">
            <span className="camera-live-chip"><b><i aria-hidden="true" />LIVE</b>AI 카메라</span>
          </div>
          <div className="camera-topline right">
            <span className="camera-latency"><Signal size={14} /> 28ms</span>
            <button type="button" className="camera-expand" aria-label="카메라 크게 보기"><Expand size={15} /></button>
          </div>
          <div className="camera-voicelevel">
            <span className="voicelevel-head">음성 레벨 <b>적정</b></span>
            <span className="voicewave" aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} />)}</span>
          </div>
          <div className="camera-eye-chip">
            <span className="eye-chip-title"><IconGlyph icon="coach" size={15} /> 시선 유지 좋음</span>
            <span className="eye-chip-sub"><CheckCircle size={14} /> 상대의 눈을 바라보고 듣고 있어요!</span>
          </div>
          <div className="camera-subtitle">
            <div className="camera-subtitle-head">
              <span className="subtitle-avatar" aria-hidden="true"><User4 size={14} /></span>
              <strong>{characterName}</strong>
              <em className="speaking-chip"><IconGlyph icon="response" size={13} /> {busy ? "답변 분석 중" : aiReady ? "AI가 말하는 중" : "질문 준비 중"}</em>
            </div>
            <p className="subtitle-quote">
              <span className="quote-mark" aria-hidden="true">“</span>
              {turn?.question_text || "다음 질문을 준비하고 있어요."}
              <span className="quote-mark close" aria-hidden="true">”</span>
            </p>
            <span className="subtitle-wave" aria-hidden="true">{Array.from({ length: 52 }, (_, i) => <i key={i} />)}</span>
          </div>
        </section>

        <aside className="practice-side">
          <section className="card live-fit-card">
            <div className="live-fit-head">
              <h2><IconGlyph icon="fit" size={18} /> 실시간 4-Fit 피드백 <InfoCircle size={15} className="muted-info" /></h2>
              <button type="button" className="text-link" onClick={onPrev}>자세히 보기 <ChevronRight size={14} /></button>
            </div>
            <div className="live-fit-grid">
              <LiveFitMeter tone="response" label="응답" english="Response" kind="percent" percent={coverage} status={coverage === null ? "대기" : "Coverage"} caption={coverage === null ? "첫 답변 후 표시돼요" : coverage >= 70 ? "잘하고 있어요!" : "핵심을 더 채워보세요"} />
              <LiveFitMeter tone="voice" label="목소리" english="Voice" kind="wave" percent={66} status="텍스트 연습" caption="또렷한 톤을 유지해 보세요" />
              <LiveFitMeter tone="eye" label="시선" english="Eye" kind="icon" icon="eye" percent={0} status="–" caption="측정 불가" muted />
              <LiveFitMeter tone="posture" label="자세" english="Posture" kind="icon" icon="posture" percent={100} status="Good" caption="좋은 자세예요!" />
            </div>
            {!aiReady && <p className="live-fit-note"><IconGlyph icon="coach" size={16} /> 기본 질문 모드로 진행 중 — Ollama 연결 시 개인화 질문이 활성화돼요.</p>}
          </section>

          <section className="card chat-log-card">
            <div className="chat-log-head">
              <h2>대화 로그 <em className="live-label"><i aria-hidden="true" />실시간</em></h2>
              <button type="button" className="text-link">전체 보기 <ChevronRight size={14} /></button>
            </div>
            <div className="chat-log-body" ref={chatBodyRef}>
              {history.map((item) => (
                <React.Fragment key={item.id}>
                  <ChatBubble ai name={characterName} time={`턴 ${item.order}`}>{item.question_text}</ChatBubble>
                  <ChatBubble mine time={`턴 ${item.order}`}>{item.response_text}</ChatBubble>
                </React.Fragment>
              ))}
              {turn?.reaction_text && <ChatBubble ai name={characterName} time="AI 반응">{turn.reaction_text}</ChatBubble>}
              {turn && <ChatBubble ai name={characterName} time={`턴 ${turn.order}`}>{turn.question_text}</ChatBubble>}
              <div className={`typing-bubble ${busy ? "busy" : ""}`} aria-label={busy ? "AI가 답을 준비하고 있어요" : "답변을 기다리고 있어요"}><i /><i /><i /></div>
              {(error || captureError) && <p className="practice-error">{error || captureError}</p>}
            </div>
          </section>
        </aside>
      </div>

      {notesOpen && (
        <div className="practice-notes-pop">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="연습 중 떠오른 메모를 남겨보세요. (전송되지 않아요)" />
        </div>
      )}

      <footer className="practice-controls">
        <div className="controls-main">
          <button type="button" className={`control-note ${notesOpen ? "active" : ""}`} onClick={() => setNotesOpen((open) => !open)}><Notebook size={19} /> 나의 노트</button>
          <div className="control-speak">
            <span className="control-speak-label"><Mic size={18} /> {busy ? "분석 중..." : "말하는 중..."}</span>
            <span className="control-wave" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} />)}</span>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim() && !busy && turn) submitDraft(); }} placeholder="메시지를 입력해 보세요" disabled={busy || !turn} />
            <span className="control-clock"><time>{formatClock(recSeconds)}</time><small>{formatClock(elapsed)}</small></span>
            <button type="button" className="control-send" aria-label="답변 보내기" onClick={submitDraft} disabled={busy || !draft.trim() || !turn}><span className="stop-square" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="controls-side">
          <button type="button" className="control-pause" onClick={() => setPaused((value) => !value)}>{paused ? <><Play size={18} /> 다시 시작</> : <><Pause size={18} /> 일시정지</>}</button>
          <button type="button" className="control-retry" onClick={() => { setDraft(""); setCaptureError(""); }}><Refresh3 size={18} /> 재시도</button>
        </div>
      </footer>
    </motion.section>
  );
}

// 얼굴 메시 + 상체 스켈레톤 트래킹 오버레이. 실시간 측정 중임을 보여주는 시각 효과예요.
// 화면 전체가 아니라 얼굴 영역 크기의 고정 박스 안에만 그려서 인물 위에 자연스럽게 얹혀요.
function TrackingOverlay() {
  const facePoints = [
    [50, 14], [40, 17], [60, 17], [33, 26], [67, 26], [30, 37], [70, 37],
    [34, 48], [66, 48], [42, 56], [58, 56], [50, 60],
    [41, 30], [59, 30], [39, 24], [61, 24], [50, 37], [46, 42], [54, 42],
    [44, 50], [56, 50],
  ];
  const faceLines = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [8, 10], [9, 11], [10, 11],
    [14, 12], [15, 13], [12, 16], [13, 16], [16, 17], [16, 18], [17, 19], [18, 20], [19, 11], [20, 11],
    [3, 12], [4, 13], [5, 17], [6, 18], [12, 13], [19, 20],
  ];
  return (
    <div className="tracking-zone" aria-hidden="true">
      <svg viewBox="0 0 100 132" preserveAspectRatio="xMidYMid meet">
        <g className="track-corners">
          <path d="M 22 8 h -9 v 9" />
          <path d="M 78 8 h 9 v 9" />
          <path d="M 22 66 h -9 v -9" />
          <path d="M 78 66 h 9 v -9" />
        </g>
        <g className="track-face">
          {faceLines.map(([a, b], index) => <line key={index} x1={facePoints[a][0]} y1={facePoints[a][1]} x2={facePoints[b][0]} y2={facePoints[b][1]} />)}
          {facePoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="1" />)}
        </g>
        <g className="track-skeleton">
          <line x1="50" y1="62" x2="50" y2="80" />
          <line x1="50" y1="80" x2="10" y2="94" />
          <line x1="50" y1="80" x2="90" y2="94" />
          <line x1="10" y1="94" x2="4" y2="120" />
          <line x1="90" y1="94" x2="96" y2="120" />
          <circle cx="50" cy="80" r="1.8" /><circle cx="10" cy="94" r="1.8" /><circle cx="90" cy="94" r="1.8" />
        </g>
        <path className="track-chest" d="M 10 94 C 32 108, 68 108, 90 94" />
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
          <p>{children}</p>
          <span className="bubble-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </div>
      </div>
    );
  }
  return (
    <div className={`chat-message ${ai ? "ai" : ""}`}>
      <span className="chat-avatar" aria-hidden="true"><User4 size={16} /></span>
      <div className="chat-content">
        <span className="chat-meta">{name} · {time}</span>
        <div className="chat-bubble"><p>{children}</p></div>
      </div>
    </div>
  );
}
