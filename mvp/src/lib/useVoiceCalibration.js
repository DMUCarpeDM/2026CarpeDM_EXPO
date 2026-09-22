import { useEffect, useState } from "react";
import { captureSettings, sameCapture } from "./voiceCapture";
import { invalidateVoiceCalibration } from "./pocApi";

export function useVoiceCalibration(session, stream) {
  const enabled = Boolean(session?.voice_analysis?.engine_version);
  const [calibration, setCalibration] = useState(session?.voice_analysis?.calibration || null);
  const [textOnly, setTextOnly] = useState(false);
  const [capture, setCapture] = useState(() => captureSettings(stream));
  useEffect(() => {
    setCalibration(session?.voice_analysis?.calibration || null);
    setTextOnly(false);
  }, [session?.id]);
  useEffect(() => {
    if (!enabled) return undefined;
    const check = () => {
      const next = captureSettings(stream);
      setCapture((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    check();
    const track = stream?.getAudioTracks?.()[0];
    track?.addEventListener("ended", check);
    const timer = setInterval(check, 1000);
    return () => { clearInterval(timer); track?.removeEventListener("ended", check); };
  }, [enabled, stream]);
  const valid = calibration?.status === "measured" && sameCapture(calibration.capture, capture);
  useEffect(() => {
    if (enabled && calibration && !valid) {
      setCalibration(null);
      void invalidateVoiceCalibration(session).catch(() => {});
    }
  }, [enabled, calibration, valid, session?.id]);
  return { enabled, calibration, capture, textOnly, open: enabled && !textOnly && !valid,
    onReady: setCalibration, onTextOnly: () => setTextOnly(true), onRetry: () => setTextOnly(false) };
}
