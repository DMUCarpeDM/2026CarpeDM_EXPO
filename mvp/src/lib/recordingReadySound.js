export const RECORDING_READY_SOUND_MS = 160;

// A quiet local tone; no network request or audio asset is needed.
export function playRecordingReadySound(onStart) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return () => {};
  let context;
  try { context = new AudioContextClass(); } catch { return () => {}; }
  let cancelled = false, closed = false, oscillator, gain;
  const close = () => {
    if (closed) return;
    closed = true;
    oscillator?.disconnect();
    gain?.disconnect();
    void context.close().catch(() => {});
  };
  void (async () => {
    try {
      await context.resume();
      if (cancelled) return;
      const start = context.currentTime;
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.045, start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, start + RECORDING_READY_SOUND_MS / 1000);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = close;
      oscillator.start(start);
      oscillator.stop(start + RECORDING_READY_SOUND_MS / 1000);
      onStart?.();
    } catch { close(); }
  })();
  return () => {
    cancelled = true;
    if (closed) return;
    if (oscillator) { oscillator.onended = null; try { oscillator.stop(); } catch {} }
    close();
  };
}
