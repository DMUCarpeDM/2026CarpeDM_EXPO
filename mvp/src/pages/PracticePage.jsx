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
import { useNonverbal } from "../lib/nonverbal/useNonverbal";

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
  const overlayRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  // 시선·자세 실측정 (MediaPipe — 원본 영상은 브라우저 밖으로 나가지 않아요).
  // 훅이 자체 카메라 스트림·랜드마커 수명주기를 관리하고, 턴 단위 집계 지표를 돌려줘요.
  const { cameraReady, visionStatus, tip, live, startTurn, endTurn, setGazePhase, startCalibration, finishCalibration } = useNonverbal(videoRef, overlayRef);
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

  // 비전 훅이 카메라를 못 열었을 때만 앱 스트림으로 미리보기를 대신해요.
  useEffect(() => {
    if (videoRef.current && mediaStream && !cameraReady && visionStatus !== "loading") {
      videoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream, cameraReady, visionStatus]);

  // 측정 기준(정면 시선·어깨 기울기)은 첫 질문을 듣는 몇 초 동안 조용히 잡아요.
  useEffect(() => {
    if (!cameraReady) return undefined;
    startCalibration();
    const timer = window.setTimeout(finishCalibration, 4000);
    return () => window.clearTimeout(timer);
  }, [cameraReady, startCalibration, finishCalibration]);

  // 턴이 바뀌면 비언어 집계를 새로 시작 — 질문을 듣는 구간은 'listening' 시선으로 기록해요.
  useEffect(() => {
    if (!turn) return;
    startTurn();
    setGazePhase("listening");
  }, [turn?.id, startTurn, setGazePhase]);

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
    if (!draft.trim() || busy || !turn) return;
    try {
      const audio = await stopTurnRecorder();
      if (audio.size === 0) throw new Error("답변 음성이 녹음되지 않았어요. 마이크 권한을 확인해 주세요.");
      // 이 턴의 실측 비언어 지표(시선·자세·표정) — 카메라가 없으면 null로 보내요(측정 제외).
      const nonverbal = endTurn();
      await onSubmit({ text: draft, audio, durationMs: Math.round(performance.now() - recordingStartedAtRef.current), nonverbalMetrics: nonverbal });
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
          <video ref={videoRef} className={`camera-video ${cameraReady || mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미리보기" />
          {!cameraReady && !mediaStream && <span className="camera-fallback"><User4 size={96} /></span>}
          {/* 실측 랜드마크 오버레이 — useNonverbal이 매 샘플 얼굴·상체 골격을 그려요 (시각화 전용, 영상 미전송) */}
          <canvas ref={overlayRef} className="tracking-overlay" width={640} height={480} aria-hidden="true" />
          <span className="camera-badge live"><i />LIVE</span>
          <span className="camera-badge ai-cam">AI 카메라</span>
          {cameraReady && live.calibrated && (
            <span className={`camera-eye-chip ${live.tracking && live.front ? "" : "off"}`}>
              <IconGlyph icon="eye" size={16} /> {live.tracking ? (live.front ? "시선 유지 좋음" : "시선이 벗어났어요") : "얼굴을 찾는 중"}
            </span>
          )}
          {tip && <div className="camera-coach-tip" role="status">{tip.text}</div>}
          <div className="camera-subtitle">
            <span className="camera-subtitle-head"><IconGlyph icon="coach" size={18} /> {characterName}<em>{aiReady ? "AI가 말하는 중" : "질문 준비 중"}</em></span>
            <p>{turn?.question_text || "다음 질문을 준비하고 있어요."}</p>
          </div>
        </section>

        <aside className="practice-side">
          <section className="card live-fit-card">
            <div className="live-fit-head"><h2><IconGlyph icon="fit" size={19} /> 실시간 4-Fit 피드백 <InfoCircle size={16} className="muted-info" /></h2><button type="button" className="text-link" onClick={onPrev}>자세히 보기 <ChevronRight size={14} /></button></div>
            <div className="live-fit-grid">
              <LiveFitMeter icon="response" label="응답" english="Response" tone="response" kind="ring" percent={coverage} caption={coverage === null ? "첫 답변 후 측정" : "답변 커버리지"} />
              <LiveFitMeter icon="voice" label="목소리" english="Voice" tone="voice" kind="wave" caption={cameraReady ? (live.micLevel > 0.06 ? "목소리 감지 중" : "말소리를 기다려요") : "답변 음성으로 분석"} />
              <LiveFitMeter icon="eye" label="시선" english="Eye" tone="eye" kind="icon" caption={eyeCaption(visionStatus, live)} />
              <LiveFitMeter icon="posture" label="자세" english="Posture" tone="posture" kind="icon" caption={postureCaption(visionStatus, live)} />
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
          <input value={draft} onChange={(event) => { if (!draft && event.target.value) setGazePhase("answering"); setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim() && !busy && turn) submitDraft(); }} placeholder="메시지를 입력해 보세요" disabled={busy || !turn} />
          <time>{formatClock(recSeconds)}</time>
          <button type="button" className="control-send" aria-label="답변 보내기" onClick={submitDraft} disabled={busy || !draft.trim() || !turn}><Send size={22} /></button>
        </div>
        <button type="button" className="control-pause" onClick={() => setPaused((value) => !value)}>{paused ? <><Play size={18} /> 다시 시작</> : <><Pause size={18} /> 일시정지</>}</button>
        <button type="button" className="control-retry" onClick={() => { setDraft(""); setCaptureError(""); }}><Refresh3 size={18} /> 재시도</button>
      </footer>
    </motion.section>
  );
}

// 라이브 패널 문구 — 실측 상태만 말해요. 측정이 안 되면 '안 된다'를 그대로 보여줍니다.
function eyeCaption(visionStatus, live) {
  if (visionStatus === "loading") return "측정 준비 중";
  if (visionStatus !== "ready") return "카메라 없음 — 측정 제외";
  if (!live.tracking) return "얼굴을 찾는 중";
  if (!live.calibrated) return "정면 기준 잡는 중";
  return live.front ? "정면 응시 중" : "시선이 벗어났어요";
}

function postureCaption(visionStatus, live) {
  if (visionStatus === "loading") return "측정 준비 중";
  if (visionStatus !== "ready") return "카메라 없음 — 측정 제외";
  if (!live.tracking) return "상체를 찾는 중";
  if (live.headDown) return "고개가 숙여졌어요";
  return Math.abs(live.tiltDeg) > 6 ? "어깨가 기울었어요" : "자세 안정적";
}

function ChatBubble({ children, ai = false, mine = false, time }) {
  return <div className={`chat-message ${ai ? "ai" : ""} ${mine ? "mine" : ""}`}>{ai && <span className="ai-badge">AI</span>}<div><p>{children}</p><time>{time}</time></div></div>;
}
