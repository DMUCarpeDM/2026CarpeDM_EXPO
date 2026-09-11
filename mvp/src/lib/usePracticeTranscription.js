import { useEffect, useRef, useState } from "react";
import { blobToWav, wavHasSpeech } from "./audioWav.js";
import { shouldScheduleAutoSubmit } from "./sttAutoSubmit.js";

// 받아쓰기와 자동 제출 예약을 관리한다. 답변 초안과 실제 제출은 페이지가 소유한다.
export function usePracticeTranscription({
  draft, setDraft, mediaStream, turn, busy, paused, aiSpeaking, entryOverlayOpen,
  aiHealth, onTranscribe, pushFeed, onAutoSubmit,
}) {
  const autoSubmitTimerRef = useRef(null);
  const autoSubmitCallbackRef = useRef(onAutoSubmit);
  autoSubmitCallbackRef.current = onAutoSubmit;
  // ---- 음성 답변(STT): 브라우저 음성 인식으로 말한 내용을 입력창에 받아 적는다 ----
  // AI가 말하는 동안은 마이크를 쉬어 스피커 소리가 답변으로 새는 걸 막는다.
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [webSpeechFailed, setWebSpeechFailed] = useState(false);
  const recognitionRef = useRef(null);
  const sttActiveRef = useRef(false);
  const sttUsedRef = useRef(false); // 이번 턴 답변에 음성 인식이 쓰였는지 (stt_source 판별)
  const draftRef = useRef(""); // 서버 받아쓰기 루프가 최신 초안을 재렌더 없이 읽는 용도
  const sttSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const serverSttReady = Boolean(onTranscribe && aiHealth?.server_stt);
  // 실사용 STT 경로: 브라우저 Web Speech(인터넷 필요) → 실패·미지원 시 서버 Whisper → 직접 입력.
  // Chrome은 오프라인이면 network 오류를 내므로 전시장에서는 server 경로가 실질 기본이 된다.
  const sttMode = sttSupported && !webSpeechFailed ? "webspeech" : serverSttReady ? "server" : "off";
  const clearAutoSubmit = () => {
    if (autoSubmitTimerRef.current) window.clearTimeout(autoSubmitTimerRef.current);
    autoSubmitTimerRef.current = null;
  };
  const scheduleAutoSubmit = () => {
    clearAutoSubmit();
    autoSubmitTimerRef.current = window.setTimeout(() => {
      autoSubmitTimerRef.current = null;
      autoSubmitCallbackRef.current?.();
    }, 3000);
  };
  useEffect(() => () => clearAutoSubmit(), []);
  useEffect(() => {
    if (paused || busy || aiSpeaking) clearAutoSubmit();
  }, [paused, busy, aiSpeaking]);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    const shouldListen = Boolean(sttMode === "webspeech" && SpeechRecognitionImpl && micEnabled && mediaStream && turn && !busy && !paused && !aiSpeaking && !entryOverlayOpen);
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
          pushFeed(`음성 인식 확정 · “${transcript.slice(0, 14)}${transcript.length > 14 ? "…" : ""}”`);
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
      // 권한 거부·오프라인·캡처 실패면 조용히 강등 — 마이크 스트림 자체는 살아 있으므로
      // (사전 권한 획득) 서버 받아쓰기가 가능하면 그쪽이, 아니면 직접 입력이 이어받는다.
      // audio-capture: 기본 입력 장치가 무신호일 때(잭에 마이크 없음 등) Chrome이 내는 오류.
      if (["not-allowed", "service-not-allowed", "network", "audio-capture"].includes(event.error)) {
        sttActiveRef.current = false;
        setWebSpeechFailed(true);
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
  }, [sttMode, micEnabled, mediaStream, turn?.id, busy, paused, aiSpeaking, turn, entryOverlayOpen]);

  // ---- 서버 받아쓰기 폴백: Web Speech가 없거나 실패하면 3초 안팎의 조각을 서버
  // Whisper로 전사해 입력창을 채운다. 조각 사이 공백이 없도록 녹음기는 즉시 재시작하고
  // 전사는 병렬로 진행한다. 무음 조각은 보내지 않고, 초안이 쌓인 뒤의 무음은 자동 전송 신호다.
  useEffect(() => {
    const shouldRun = sttMode === "server" && micEnabled && mediaStream && turn && !busy && !paused && !aiSpeaking && !entryOverlayOpen;
    if (!shouldRun || !window.MediaRecorder) return undefined;
    const audioTracks = mediaStream.getAudioTracks().filter((item) => item.readyState === "live");
    if (!audioTracks.length) return undefined;
    let active = true;
    let recorder = null;
    let timer = 0;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    setListening(true);

    const processChunk = async (blob) => {
      try {
        if (!blob || blob.size < 1200) return;
        const wav = await blobToWav(blob).catch(() => null);
        if (!active || !wav) return;
        if (!(await wavHasSpeech(wav))) {
          // 말이 멈춘 조각 — 이번 턴에 음성 입력이 실제로 쓰였고, 쌓인 답변이 있고,
          // 예약이 없을 때만 자동 전송한다. 타이핑만 한 초안을 무음이 밀어 보내면 안 되고
          // (생각하며 천천히 치는 중일 수 있다), 예약을 매번 다시 걸면 3초 창이 계속 밀린다.
          if (active && sttUsedRef.current && draftRef.current.trim() && !autoSubmitTimerRef.current) scheduleAutoSubmit();
          return;
        }
        const sttStartedAt = performance.now();
        const result = await onTranscribe(wav);
        const text = (result?.text || "").trim();
        if (!active || !text) return;
        sttUsedRef.current = true;
        clearAutoSubmit(); // 아직 말하는 중 — 조기 전송 방지
        setDraft((prev) => `${prev} ${text}`.trim());
        pushFeed(`Whisper 전사 ${Math.round(performance.now() - sttStartedAt)}ms · “${text.slice(0, 14)}${text.length > 14 ? "…" : ""}”`);
      } catch { /* 조각 전사 실패는 다음 조각에서 회복 */ }
    };

    const cycle = () => {
      if (!active) return;
      recorder = new MediaRecorder(new MediaStream(audioTracks), { mimeType });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        cycle(); // 다음 조각 녹음을 먼저 시작해 발화 공백을 막는다
        void processChunk(blob);
      };
      recorder.start();
      timer = window.setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 3200);
    };
    cycle();

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (recorder && recorder.state !== "inactive") { recorder.onstop = null; recorder.stop(); }
      setListening(false);
    };
  }, [sttMode, micEnabled, mediaStream, turn?.id, busy, paused, aiSpeaking, turn, onTranscribe, entryOverlayOpen]);

  const stopBrowserRecognition = () => {
    sttActiveRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* 이미 종료됨 */ }
  };
  const getSttSource = () => sttUsedRef.current ? (sttMode === "server" ? "server-whisper" : "webspeech") : "text";
  const resetSttUsage = () => { sttUsedRef.current = false; };

  return {
    listening, interim, setInterim, micEnabled, setMicEnabled, sttMode,
    clearAutoSubmit, stopBrowserRecognition, getSttSource, resetSttUsage,
  };
}
