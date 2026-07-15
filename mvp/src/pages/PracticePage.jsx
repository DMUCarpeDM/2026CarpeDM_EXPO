import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "reicon-react/icons/ArrowLeft";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { Bulb2 } from "reicon-react/icons/Bulb2";
import { Mic } from "reicon-react/icons/Mic";
import { Send } from "reicon-react/icons/Send";
import { User4 } from "reicon-react/icons/User4";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { NonverbalTracker } from "../lib/nonverbal";

export function PracticePage({ onPrev, scenario, aiHealth, turn, history, turnSignals, onSubmit, busy, error, mediaStream }) {
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const trackerRef = useRef(null);
  const character = scenario?.characters?.find((item) => item.id === turn?.character_id);
  const characterName = character?.name || "AI 상대";
  const responseState = turnSignals ? `${Math.round(turnSignals.coverage * 100)}% 커버` : "답변 대기";
  const aiState = aiHealth?.dialogue_provider === "ollama" && aiHealth?.ollama?.dialogue ? "Ollama 개인화" : "기본 질문 모드";
  const [collapsedPanels, setCollapsedPanels] = useState(() => {
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
    return { status: false, chat: isMobile };
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const syncMobileDensity = () => setCollapsedPanels((current) => ({ ...current, chat: media.matches }));
    syncMobileDensity();
    media.addEventListener("change", syncMobileDensity);
    return () => media.removeEventListener("change", syncMobileDensity);
  }, []);

  useEffect(() => {
    if (videoRef.current && mediaStream) videoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  // 비언어 측정(Eye/Posture) 모델을 미리 로드하고 언마운트 시 해제
  useEffect(() => {
    const tracker = new NonverbalTracker();
    trackerRef.current = tracker;
    tracker.load();
    return () => { tracker.close(); trackerRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mediaStream || !turn) return undefined;
    if (!window.MediaRecorder) {
      setCaptureError("이 브라우저에서는 마이크 녹음을 시작할 수 없어요.");
      return undefined;
    }
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      setCaptureError("마이크 권한이 필요해요.");
      return undefined;
    }
    audioChunksRef.current = [];
    recordingStartedAtRef.current = performance.now();
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(new MediaStream(audioTracks), { mimeType });
    recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
    recorderRef.current = recorder;
    recorder.start();
    setCaptureError("");
    // 비언어 측정 시작 — 모델 로드가 끝나는 대로(첫 턴 포함) 이 턴 동안 시선·자세를 표본화
    let cancelledTracker = false;
    (async () => {
      const tracker = trackerRef.current;
      if (!tracker) return;
      await tracker.load();
      if (!cancelledTracker && videoRef.current) tracker.start(videoRef.current);
    })();
    return () => {
      cancelledTracker = true;
      if (recorder.state !== "inactive") recorder.stop();
      trackerRef.current?.stop();
    };
  }, [mediaStream, turn]);

  const stopTurnRecorder = () => new Promise((resolve, reject) => {
    const recorder = recorderRef.current;
    if (!recorder) {
      reject(new Error("마이크 녹음이 준비되지 않았어요."));
      return;
    }
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
      // 시선·자세 측정 종료 → NonverbalIn 페이로드. 모델 미로드·표본 부족이면 카메라 메타로 폴백(측정 제외)
      const nonverbalMetrics = trackerRef.current?.stop() ?? collectNonverbalMetrics();
      await onSubmit({ text: draft, audio, durationMs: Math.round(performance.now() - recordingStartedAtRef.current), nonverbalMetrics });
      setDraft("");
      setCaptureError("");
    } catch (err) { setCaptureError(err.message); }
  };

  const togglePanel = (panel) => setCollapsedPanels((current) => ({ ...current, [panel]: !current[panel] }));

  return (
    <motion.section className="page practice-page" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <PageToolbar onPrev={onPrev} leftLabel="나가기" />
      <div className="practice-layout">
        <section className="camera-column" aria-label="연습 카메라와 대화 입력">
          <div className="camera-frame">
            <video ref={videoRef} className={`camera-video ${mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미리보기" />
            <div className="rec-label"><span /> 카메라·마이크 측정 중</div>
            <div className="camera-ai-prompt"><span><IconGlyph icon="coach" size={19} /> {characterName}</span><p>{turn?.question_text || "다음 질문을 준비하고 있어요."}</p></div>
            {!mediaStream && <Portrait variant="neutral" stage />}
            <div className="face-guide" /><div className="body-guide" /><span className="guide-chip">텍스트로 연습 중</span>
            <div className="record-control-strip" aria-label="답변 컨트롤"><span><WaveIcon /> 말하면서 답변을 입력해 주세요</span><button type="button" aria-label="녹음 중" disabled><IconGlyph icon="pause" size={18} /></button></div>
            <div className="camera-panel-stack">
              <Panel className={`live-status-panel practice-glass-panel collapsible-panel ${collapsedPanels.status ? "is-collapsed" : ""}`}>
                <div className="panel-toggle-head"><h2><IconGlyph icon="fit" size={19} /> 실시간 상태 <StatusBadge>{aiState}</StatusBadge></h2><button className="panel-toggle-button" type="button" aria-expanded={!collapsedPanels.status} aria-label={collapsedPanels.status ? "실시간 상태 펼치기" : "실시간 상태 접기"} onClick={() => togglePanel("status")}><ChevronDown size={18} /></button></div>
                <div className="collapsible-content" hidden={collapsedPanels.status}><div className="live-status-grid"><LiveChip icon="response" label="Response" value={responseState} tone="response" /><LiveChip icon="voice" label="Voice" value="녹음 중" tone="voice" /><LiveChip icon="eye" label="Eye" value="카메라 측정" tone="eye" /><LiveChip icon="posture" label="Posture" value="카메라 측정" tone="posture" /></div><div className="tip-strip small"><Bulb2 size={22} /><p><strong>AI 상태</strong> {aiState}. 핵심 행동과 기한을 한 문장으로 먼저 정리해 답변해 보세요.</p></div></div>
              </Panel>
              <Panel className={`chat-panel practice-glass-panel collapsible-panel ${collapsedPanels.chat ? "is-collapsed" : ""}`}>
                <div className="chat-panel-head panel-toggle-head"><div><span>AI 대화</span><strong>상대: {characterName}</strong></div><div className="chat-head-actions"><b>턴 {turn?.order || 0}</b><button className="panel-toggle-button" type="button" aria-expanded={!collapsedPanels.chat} aria-label={collapsedPanels.chat ? `${characterName} 역할극 펼치기` : `${characterName} 역할극 접기`} onClick={() => togglePanel("chat")}><ChevronDown size={18} /></button></div></div>
                <div className="collapsible-content chat-collapsible-content" hidden={collapsedPanels.chat}>
                  {history.map((item) => <React.Fragment key={item.id}><ChatMessage ai time={`턴 ${item.order}`}>{item.question_text}</ChatMessage><ChatMessage mine time="나의 답변">{item.response_text}</ChatMessage></React.Fragment>)}
                  {turn?.reaction_text && <ChatMessage ai time="AI 반응">{turn.reaction_text}</ChatMessage>}
                  {turn && <ChatMessage ai time={`턴 ${turn.order}`}>{turn.question_text}</ChatMessage>}
                  <div className="typing-bubble"><i /><i /><i />{busy ? "AI가 답을 준비하고 있어요" : "답변을 입력해 보내세요"}</div>
                  {(error || captureError) && <p className="share-notice">{error || captureError}</p>}
                  <div className="message-input"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim() && !busy && turn) submitDraft(); }} placeholder="메시지를 입력해 보세요" disabled={busy || !turn} /><button className="mic-button" type="button" aria-label="마이크 녹음 중" disabled><Mic size={28} /></button><button className="send-button" type="button" aria-label="답변 보내기" onClick={submitDraft} disabled={busy || !draft.trim() || !turn}><Send size={24} /></button></div>
                </div>
              </Panel>
            </div>
          </div>
        </section>
      </div>
    </motion.section>
  );
}

function PageToolbar({ onPrev, leftLabel = "이전 단계" }) {
  return <div className="page-toolbar"><button className="ghost-pill" type="button" onClick={onPrev}><ArrowLeft size={18} /> {leftLabel}</button></div>;
}

function Panel({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function StatusBadge({ children, tone = "blue" }) {
  return <span className={`ai-status-badge ${tone}`}>{children}</span>;
}

function LiveChip({ icon, label, value, tone }) {
  return <div className={`live-chip ${tone}`}><span><IconGlyph icon={icon} size={22} />{label}</span><strong>{value}</strong></div>;
}

function ChatMessage({ children, ai = false, mine = false, time }) {
  return <div className={`chat-message ${ai ? "ai" : ""} ${mine ? "mine" : ""}`}>{ai && <span className="ai-badge">AI</span>}<div><p>{children}</p><time>{time}</time></div></div>;
}

function Portrait({ variant = "neutral", stage = false }) {
  return <span className={`portrait ${variant} ${stage ? "stage" : ""}`}><User4 size={stage ? 96 : 72} /></span>;
}

function WaveIcon() {
  return <span className="wave-icon">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>;
}
