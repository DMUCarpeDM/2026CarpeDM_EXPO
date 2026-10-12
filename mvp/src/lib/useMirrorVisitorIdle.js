import { useCallback, useEffect, useRef } from "react";

export const MIRROR_VISITOR_IDLE_MS = 30_000;

// Match the existing voice capture's RMS/peak gate; ignore low noise and isolated clicks.
function hasVoiceSignal(samples) {
  let sum = 0;
  let peak = 0;
  for (const sample of samples) {
    sum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return Math.sqrt(sum / samples.length) >= 0.008 && peak >= 0.06;
}

export function useMirrorVisitorIdle({ enabled, mediaStream, lastPersonAtRef, pausedRef, onIdle }) {
  const lastActivityAtRef = useRef(0);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const markActivity = useCallback(() => { lastActivityAtRef.current = performance.now(); }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    markActivity();
    let expired = false;
    const timer = window.setInterval(() => {
      if (expired) return;
      if (pausedRef.current) { markActivity(); return; }
      const lastInput = Math.max(lastActivityAtRef.current, lastPersonAtRef.current);
      if (performance.now() - lastInput < MIRROR_VISITOR_IDLE_MS) return;
      expired = true;
      onIdleRef.current();
    }, 100);
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, markActivity));
    };
  }, [enabled, lastPersonAtRef, pausedRef, markActivity]);

  useEffect(() => {
    const tracks = mediaStream?.getAudioTracks().filter((track) => track.readyState === "live") || [];
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!enabled || !tracks.length || !AudioContextClass) return undefined;
    const context = new AudioContextClass();
    const resume = () => { void context.resume().catch(() => {}); };
    resume();
    window.addEventListener("pointerdown", resume);
    const source = context.createMediaStreamSource(new MediaStream(tracks));
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let voicedFrames = 0;
    const timer = window.setInterval(() => {
      if (pausedRef.current || context.state !== "running" || !tracks.some((track) => track.readyState === "live" && track.enabled && !track.muted)) {
        voicedFrames = 0;
        return;
      }
      analyser.getFloatTimeDomainData(samples);
      voicedFrames = hasVoiceSignal(samples) ? voicedFrames + 1 : 0;
      if (voicedFrames >= 3) markActivity();
    }, 100);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", resume);
      source.disconnect();
      void context.close();
    };
  }, [enabled, mediaStream, pausedRef, markActivity]);

  return markActivity;
}
