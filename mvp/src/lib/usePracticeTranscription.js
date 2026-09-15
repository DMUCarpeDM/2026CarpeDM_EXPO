import { useEffect, useRef, useState } from "react";
import { shouldScheduleAutoSubmit } from "./sttAutoSubmit.js";

// 받아쓰기와 자동 제출 예약을 관리한다. 답변 초안과 실제 제출은 페이지가 소유한다.
export function usePracticeTranscription({
  setDraft, mediaStream, turn, busy, paused, aiSpeaking, entryOverlayOpen,
  pushFeed, onAutoSubmit,
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
  const sttSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  // 실시간 받아쓰기는 Chrome만 사용한다. Whisper는 녹음 종료 후 간투어 분석용이다.
  const sttMode = sttSupported && !webSpeechFailed ? "webspeech" : "off";
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
      // 인식 실패 시 직접 입력으로 전환한다. 녹음은 최종 간투어 분석에 사용한다.
      if (["not-allowed", "service-not-allowed", "network", "audio-capture"].includes(event.error)) {
        sttActiveRef.current = false;
        clearAutoSubmit();
        setWebSpeechFailed(true);
        pushFeed("Chrome 음성 인식을 사용할 수 없어 직접 입력으로 전환했어요.");
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

  const stopBrowserRecognition = () => {
    sttActiveRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* 이미 종료됨 */ }
  };
  const getSttSource = () => sttUsedRef.current ? "webspeech" : "text";
  const resetSttUsage = () => { sttUsedRef.current = false; };

  return {
    listening, interim, setInterim, micEnabled, setMicEnabled, sttMode,
    clearAutoSubmit, stopBrowserRecognition, getSttSource, resetSttUsage,
  };
}
