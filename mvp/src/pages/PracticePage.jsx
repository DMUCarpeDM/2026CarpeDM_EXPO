import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { Expand } from "reicon-react/icons/Expand";
import { Mic } from "reicon-react/icons/Mic";
import { Pause } from "reicon-react/icons/Pause";
import { Play } from "reicon-react/icons/Play";
import { Power } from "reicon-react/icons/Power";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { TeamLeadVideo } from "../components/practice/TeamLeadVideo";
import { blobToWav } from "../lib/audioWav";
import { shouldScheduleAutoSubmit } from "../lib/sttAutoSubmit";
import { useFaceTracking } from "../lib/useFaceTracking";
import counterpartPortrait from "../assets/team-lead-video-portrait.png";

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
  const analysisVideoRef = useRef(null);
  const overlayRef = useRef(null);
  const cameraRef = useRef(null);
  const chatBodyRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const stampsRef = useRef(new Map());
  const autoSubmitTimerRef = useRef(null);
  const submitDraftRef = useRef(null);
  const character = scenario?.characters?.find((item) => item.id === turn?.character_id) || scenario?.characters?.[0];
  const characterName = character?.name || "AI 상대";
  const isTeamLead = character?.id === "kim_teamlead";
  const aiReady = aiHealth?.dialogue_provider === "ollama" && aiHealth?.ollama?.dialogue;
  // MediaPipe 실시간 얼굴·상체 트래킹 (영상 미전송 — 브라우저 안에서만 분석)
  const track = useFaceTracking(mediaStream, analysisVideoRef, overlayRef);
  const trackingLive = track.status === "ready" && track.tracking;

  // ---- 턴 단위 비언어 집계: 훅 내부(blendshape 접근 가능)에서 샘플 단위로 모은
  // 리치 지표(깜빡임·미소·긴장 신호·응시 스트릭·시선 방향 분포)를 제출 시 회수한다.
  // 턴이 바뀌면 이전 턴 잔여 집계를 버려 창을 정렬한다.
  useEffect(() => {
    track.collectTurnStats?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.id]);
  const buildNonverbal = () => track.collectTurnStats?.() || null;

  // ---- AI 음성(TTS): 새 질문이 오면 AI 상대가 실제로 읽어준다 ----
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [teamLeadReaction, setTeamLeadReaction] = useState("");
  const teamLeadVideoState = aiSpeaking ? "speaking" : teamLeadReaction || "listening";
  useEffect(() => {
    if (!isTeamLead || !turnSignals?.case) return undefined;
    if (["excellent", "covered"].includes(turnSignals.case)) {
      setTeamLeadReaction("positive");
    } else if (turnSignals.case === "risky") {
      setTeamLeadReaction("negative");
    } else {
      setTeamLeadReaction("");
    }
  }, [isTeamLead, turnSignals]);
  useEffect(() => {
    const text = turn?.question_text;
    const synth = window.speechSynthesis;
    if (!text || paused) return undefined;
    let cancelled = false;
    const finishSpeaking = () => {
      if (!cancelled) setAiSpeaking(false);
    };
    // 음성 합성 시작 이벤트가 지연되는 브라우저에서도 질문과 동시에 준비된 발화 영상이 보이게 한다.
    setAiSpeaking(true);
    const fallbackTimer = window.setTimeout(finishSpeaking, Math.min(12000, Math.max(3000, text.length * 150)));
    if (!synth) return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      setAiSpeaking(false);
    };
    const utter = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    utter.voice = voices.find((v) => v.lang?.startsWith("ko") && v.localService) || voices.find((v) => v.lang?.startsWith("ko")) || null;
    utter.lang = "ko-KR";
    utter.rate = 1.04;
    utter.onstart = () => { if (!cancelled) setAiSpeaking(true); };
    utter.onend = finishSpeaking;
    utter.onerror = finishSpeaking;
    synth.cancel();
    synth.speak(utter);
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      synth.cancel();
      setAiSpeaking(false);
    };
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
  const hasCamera = Boolean(mediaStream?.getVideoTracks?.().some((item) => item.readyState === "live"));
  const hasMicrophone = Boolean(mediaStream?.getAudioTracks?.().some((item) => item.readyState === "live"));
  const analysisTools = [
    { label: "대화 AI", detail: "Ollama", ready: aiReady },
    { label: "음성 인식", detail: "STT", ready: sttSupported && micEnabled && hasMicrophone },
    { label: "카메라 분석", detail: "MediaPipe", ready: hasCamera && track.status === "ready" },
    { label: "마이크", detail: "입력", ready: hasMicrophone },
  ];
  const clearAutoSubmit = () => {
    if (autoSubmitTimerRef.current) window.clearTimeout(autoSubmitTimerRef.current);
    autoSubmitTimerRef.current = null;
  };
  const scheduleAutoSubmit = () => {
    clearAutoSubmit();
    autoSubmitTimerRef.current = window.setTimeout(() => {
      autoSubmitTimerRef.current = null;
      submitDraftRef.current?.();
    }, 3000);
  };
  useEffect(() => () => clearAutoSubmit(), []);
  useEffect(() => {
    if (paused || busy || aiSpeaking) clearAutoSubmit();
  }, [paused, busy, aiSpeaking]);

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
      let receivedFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript.trim();
        if (!transcript) continue;
        if (event.results[i].isFinal) {
          receivedFinal = true;
          sttUsedRef.current = true;
          setDraft((prev) => `${prev} ${transcript}`.trim());
        }
        else interimText += transcript;
      }
      setInterim(interimText);
      if (shouldScheduleAutoSubmit({ receivedFinal, interimText })) scheduleAutoSubmit();
      else if (interimText) clearAutoSubmit();
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
    if (analysisVideoRef.current && mediaStream) analysisVideoRef.current.srcObject = mediaStream;
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
      clearAutoSubmit();
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
  submitDraftRef.current = submitDraft;

  const toggleCameraFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else cameraRef.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <motion.section className={`practice-screen ${paused ? "is-paused" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <motion.div className="practice-contextbar" {...rise(0)}>
        <div className="practice-contextbar-left">
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
        <div className="practice-contextbar-right">
          <span className="practice-timer"><i className="rec-dot" aria-hidden="true" />{formatClock(elapsed)}</span>
          <button type="button" className="practice-utility" onClick={() => setPaused((value) => !value)}>{paused ? <><Play size={16} /> 다시 시작</> : <><Pause size={16} /> 일시정지</>}</button>
          <button type="button" className="practice-utility" onClick={() => { clearAutoSubmit(); setDraft(""); setInterim(""); setCaptureError(""); }}><Refresh3 size={16} /> 재시도</button>
          <button type="button" className="practice-end" onClick={onPrev}><Power size={16} /> 연습 종료</button>
        </div>
      </motion.div>

      <div className="practice-stage">
        <motion.section className="practice-camera" aria-label={isTeamLead ? "팀장 반응 영상" : "연습 카메라"} ref={cameraRef} {...rise(0.06)}>
          {isTeamLead ? <TeamLeadVideo state={teamLeadVideoState} name={characterName} paused={paused} onReactionComplete={() => setTeamLeadReaction("")} /> : <><video ref={analysisVideoRef} className={`camera-video ${mediaStream ? "is-live" : ""}`} autoPlay muted playsInline aria-label="내 카메라 미리보기" /><canvas ref={overlayRef} className="tracking-canvas" aria-hidden="true" />{!trackingLive && <TrackingOverlay silhouette={!mediaStream} />}</>}
          {isTeamLead && <><video ref={analysisVideoRef} className="analysis-video" autoPlay muted playsInline aria-hidden="true" /><canvas ref={overlayRef} className="analysis-canvas" aria-hidden="true" /></>}
          <div className="camera-topline left">
            <span className="camera-live-chip"><b><i aria-hidden="true" />LIVE</b>{isTeamLead ? "AI 상대" : "AI 카메라"}</span>
          </div>
          <div className="camera-topline right">
            <button type="button" className="camera-expand" onClick={toggleCameraFullscreen} aria-label="카메라 전체 화면">
              <Expand size={15} />
            </button>
          </div>
          {turn && <div className="camera-dialogue">
            <AiPromptOverlay name={characterName} speaking={aiSpeaking} text={turn.question_text} />
            <div className="control-speak">
              <button type="button" className={`control-speak-label ${listening ? "listening" : ""}`} onClick={() => setMicEnabled((value) => !value)} disabled={!sttSupported} title={sttSupported ? "음성 입력 켜기/끄기" : "이 브라우저는 음성 입력을 지원하지 않아요"}>
                <Mic size={18} /> {busy ? "분석 중..." : listening ? "듣는 중..." : !sttSupported || !micEnabled || !hasMicrophone ? "직접 입력" : "말하는 중..."}
              </button>
              <span className={`control-wave ${listening ? "is-listening" : ""}`} aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} />)}</span>
              <input value={inputValue} onChange={(event) => { clearAutoSubmit(); setDraft(event.target.value); setInterim(""); }} onKeyDown={(event) => { if (event.key === "Enter" && inputValue.trim() && !busy && turn) submitDraft(); }} placeholder="말 끝나면 전송" aria-label="말을 마치면 3초 뒤 자동으로 전달해요" disabled={busy || !turn} />
              <span className="control-clock"><time>{formatClock(recSeconds)}</time><small>{formatClock(elapsed)}</small></span>
              <button type="button" className="control-send" onClick={submitDraft} disabled={busy || !inputValue.trim() || !turn}><span>전송</span><ChevronRight size={16} aria-hidden="true" /></button>
            </div>
          </div>}
        </motion.section>

        <aside className="practice-side">
          <motion.section className="card tool-status-card" {...rise(0.12)}>
            <div className="tool-status-head">
              <div><h2>분석 도구 연결 상태</h2><p>현재 연습에 사용할 도구예요.</p></div>
            </div>
            <div className="tool-status-list">
              {analysisTools.map((tool) => <div className={`tool-status-row ${tool.ready ? "ready" : "waiting"}`} key={tool.label}>
                <span className="tool-status-copy"><strong>{tool.label}</strong><small>{tool.detail}</small></span>
                <span className="tool-status-state" aria-label={`${tool.label} ${tool.ready ? "켜짐" : "꺼짐"}`}><i aria-hidden="true" /><b>{tool.ready ? "ON" : "OFF"}</b></span>
              </div>)}
            </div>
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
              {turn && <ChatBubble ai name={characterName} time={turn.asked_at || stampFor(`q-${turn.id}`, `턴 ${turn.order}`)}>{turn.question_text}</ChatBubble>}
              <div className={`typing-bubble ${busy ? "busy" : ""}`} aria-label={busy ? "AI가 답을 준비하고 있어요" : "답변을 기다리고 있어요"}><i /><i /><i /></div>
              {(error || captureError) && <p className="practice-error">{error || captureError}</p>}
            </div>
          </motion.section>
        </aside>
      </div>

    </motion.section>
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

function AiPromptOverlay({ name, speaking, text }) {
  return <section className={`ai-prompt-overlay ${speaking ? "is-speaking" : ""}`} aria-label={`${name}의 질문`}>
    <div className="ai-prompt-meta">
      <span className="ai-prompt-avatar" aria-hidden="true"><img src={counterpartPortrait} alt="" /></span>
      <strong>{name}</strong>
      <em>{speaking ? "AI가 말하는 중" : "AI 질문"}</em>
    </div>
    <p><b aria-hidden="true">“</b>{text}<b aria-hidden="true">”</b></p>
    <span className="ai-prompt-wave" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i key={index} />)}</span>
  </section>;
}
