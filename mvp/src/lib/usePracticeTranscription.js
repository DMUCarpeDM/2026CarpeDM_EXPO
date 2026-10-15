import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AUTO_SUBMIT_DELAY_MS, shouldScheduleAutoSubmit } from "./sttAutoSubmit.js";

// 받아쓰기와 자동 제출 예약을 관리한다. 답변 초안과 실제 제출은 페이지가 소유한다.
export function usePracticeTranscription({
  setDraft, mediaStream, turn, busy, paused, aiSpeaking, aiSpeechActiveRef, entryOverlayOpen,
  pushFeed, onAutoSubmit, autoSubmit = true,
}) {
  const autoSubmitTimerRef = useRef(null);
  const speechTimingRef = useRef(null);
  const resumeRequestedAtRef = useRef(null);
  const submitAfterCommitRef = useRef(false);
  const autoSubmitCallbackRef = useRef(onAutoSubmit);
  autoSubmitCallbackRef.current = onAutoSubmit;
  // ---- 음성 답변(STT): 브라우저 음성 인식으로 말한 내용을 입력창에 받아 적는다 ----
  // AI가 말하는 동안은 마이크를 쉬어 스피커 소리가 답변으로 새는 걸 막는다.
  const [listening, setListening] = useState(false);
  const [recognitionEpoch, setRecognitionEpoch] = useState(0);
  const [interim, setInterim] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [webSpeechFailed, setWebSpeechFailed] = useState(false);
  const [recognitionError, setRecognitionError] = useState(null);
  const networkRetriesRef = useRef(0);
  const recognitionRef = useRef(null);
  const sttActiveRef = useRef(false);
  const sttUsedRef = useRef(false); // 이번 턴 답변에 음성 인식이 쓰였는지 (stt_source 판별)
  const sttSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  // 실시간 받아쓰기는 Chrome만 사용한다. Whisper는 녹음 종료 후 간투어 분석용이다.
  const sttMode = sttSupported && !webSpeechFailed ? "webspeech" : "off";
  const shouldListen = Boolean(sttMode === "webspeech" && micEnabled && mediaStream && turn && !busy && !paused && !aiSpeaking && !entryOverlayOpen);
  const allowedRef = useRef(false);
  allowedRef.current = shouldListen;
  const clearAutoSubmit = () => {
    submitAfterCommitRef.current = false;
    if (autoSubmitTimerRef.current) window.clearTimeout(autoSubmitTimerRef.current);
    autoSubmitTimerRef.current = null;
  };
  const scheduleAutoSubmit = () => {
    clearAutoSubmit();
    submitAfterCommitRef.current = true;
  };
  // 확정 초안이 React에 반영된 뒤 제출한다. 0ms 타이머만으로는 이전 초안을 보낼 수 있다.
  useLayoutEffect(() => {
    if (!submitAfterCommitRef.current) return;
    submitAfterCommitRef.current = false;
    if (!allowedRef.current || aiSpeechActiveRef?.current) return;
    autoSubmitTimerRef.current = window.setTimeout(() => {
      autoSubmitTimerRef.current = null;
      if (!allowedRef.current || aiSpeechActiveRef?.current) return;
      speechTimingRef.current?.("auto-submit");
      autoSubmitCallbackRef.current?.();
    }, AUTO_SUBMIT_DELAY_MS);
  });
  useEffect(() => () => clearAutoSubmit(), []);
  useEffect(() => {
    if (paused || busy || aiSpeaking) clearAutoSubmit();
  }, [paused, busy, aiSpeaking]);


  useLayoutEffect(() => {
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!shouldListen || aiSpeechActiveRef?.current) return undefined;
    let retryTimer;
    let retryPending = false;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;
    const isCurrent = () => allowedRef.current && !aiSpeechActiveRef?.current && sttActiveRef.current && recognitionRef.current === recognition;
    let speechEndAt = null;
    let finalAt = null;
    let startRequestedAt = null;
    const recordTiming = (event) => {
      if (!isCurrent()) return;
      const now = performance.now();
      const timing = {
        turnId: turn.id, event, atMs: now,
        resumeRequestedAtMs: resumeRequestedAtRef.current,
        startRequestedAtMs: startRequestedAt,
        resumeToStartMs: startRequestedAt !== null && resumeRequestedAtRef.current !== null ? Math.round(startRequestedAt - resumeRequestedAtRef.current) : null,
        browserStartupMs: event === "listening" && startRequestedAt !== null ? Math.round(now - startRequestedAt) : null,
        speechEndAtMs: speechEndAt, finalAtMs: finalAt,
        endToFinalMs: speechEndAt !== null && finalAt !== null ? Math.round(finalAt - speechEndAt) : null,
        finalToSubmitMs: event === "auto-submit" && finalAt !== null ? Math.round(now - finalAt) : null,
      };
      // 브라우저 이벤트 시간만 보관한다. 음성과 전사 내용은 저장하지 않는다.
      window.__mirrorSpeechTimings = [...(window.__mirrorSpeechTimings || []).slice(-99), timing];
      console.info("[speech-latency]", timing);
      if (event === "final" && timing.endToFinalMs !== null) {
        pushFeed(`브라우저 발화 종료 → 인식 확정 ${timing.endToFinalMs}ms`);
      }
    };
    speechTimingRef.current = recordTiming;
    recognition.onspeechstart = () => {
      if (!isCurrent()) return;
      speechEndAt = null;
      finalAt = null;
      clearAutoSubmit();
      recordTiming("speech-start");
    };
    recognition.onspeechend = () => {
      if (!isCurrent()) return;
      speechEndAt = performance.now();
      recordTiming("speech-end");
    };
    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      networkRetriesRef.current = 0;
      setRecognitionError(null);
      let interimText = "";
      let receivedFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript.trim();
        if (!transcript) continue;
        sttUsedRef.current = true;
        if (event.results[i].isFinal) {
          receivedFinal = true;
          sttUsedRef.current = true;
          setDraft((prev) => `${prev} ${transcript}`.trim());
          pushFeed(`음성 인식 확정 · “${transcript.slice(0, 14)}${transcript.length > 14 ? "…" : ""}”`);
        }
        else interimText += transcript;
      }
      setInterim(interimText);
      if (receivedFinal) {
        finalAt = performance.now();
        recordTiming("final");
      }
      if (autoSubmit && shouldScheduleAutoSubmit({ receivedFinal, interimText })) scheduleAutoSubmit();
      else if (interimText) clearAutoSubmit();
    };
    recognition.onstart = () => {
      if (!isCurrent()) return;
      recordTiming("listening");
      setListening(true);
    };
    recognition.onend = () => {
      if (!isCurrent() || retryPending) return;
      setListening(false);
      setInterim("");
      // 단발 인식은 여기서 종료한다. 다음 AI 발화가 끝나거나 사용자가 재시도하면 다시 듣는다.
    };
    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      console.warn("[speech-recognition]", event.error);
      if (event.error === "network" && networkRetriesRef.current < 3) {
        retryPending = true;
        setListening(false);
        clearAutoSubmit();
        const delay = 1000 * 2 ** networkRetriesRef.current++;
        retryTimer = window.setTimeout(() => {
          if (isCurrent()) setRecognitionEpoch(epoch => epoch + 1);
        }, delay);
        return;
      }
      if (["not-allowed", "service-not-allowed", "network", "audio-capture"].includes(event.error)) {
        sttActiveRef.current = false;
        clearAutoSubmit();
        setListening(false);
        setRecognitionError(event.error);
        setWebSpeechFailed(true);
        pushFeed("음성 인식이 중단됐어요. 다시 실행해 주세요.");
      }
    };
    recognitionRef.current = recognition;
    sttActiveRef.current = true;
    startRequestedAt = performance.now();
    recordTiming("start-request");
    try { recognition.start(); } catch { /* 중복 시작 무시 */ }
    return () => {
      clearAutoSubmit();
      window.clearTimeout(retryTimer);
      sttActiveRef.current = false;
      recognition.onresult = recognition.onstart = recognition.onend = recognition.onerror = null;
      recognition.onspeechstart = recognition.onspeechend = null;
      if (speechTimingRef.current === recordTiming) speechTimingRef.current = null;
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      try { recognition.abort(); } catch { /* 이미 종료됨 */ }
      setListening(false);
      setInterim("");
    };
  }, [sttMode, micEnabled, mediaStream, turn?.id, busy, paused, aiSpeaking, turn, entryOverlayOpen, recognitionEpoch, autoSubmit]);

  const stopBrowserRecognition = () => {
    sttActiveRef.current = false;
    clearAutoSubmit();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = recognition.onstart = recognition.onend = recognition.onerror = null;
      recognition.onspeechstart = recognition.onspeechend = null;
      speechTimingRef.current = null;
      try { recognition.abort(); } catch { /* 이미 종료됨 */ }
    }
    setListening(false);
    setInterim("");
  };
  const resumeBrowserRecognition = () => {
    resumeRequestedAtRef.current = performance.now();
    setRecognitionEpoch(epoch => epoch + 1);
  };
  const retryBrowserRecognition = () => { networkRetriesRef.current = 0; setRecognitionError(null); setWebSpeechFailed(false); setMicEnabled(true); setRecognitionEpoch(epoch => epoch + 1); };
  const getSttSource = () => sttUsedRef.current ? "webspeech" : "text";
  const resetSttUsage = () => { sttUsedRef.current = false; };

  return {
    listening, interim, setInterim, micEnabled, setMicEnabled, sttMode, recognitionError: sttSupported ? recognitionError : "unsupported",
    clearAutoSubmit, stopBrowserRecognition, resumeBrowserRecognition, retryBrowserRecognition, getSttSource, resetSttUsage,
  };
}
