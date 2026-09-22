import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/shadcn";
import { blobToWav } from "../../lib/audioWav";
import { calibrateVoice } from "../../lib/pocApi";
import { captureSettings, sameCapture, voiceReason } from "../../lib/voiceCapture";
import "../../styles/voice-measurement.css";

export function MicrophoneCheck({ session, stream, onRequestMedia, onReady, onTextOnly }) {
  const dialog = useRef(null);
  const recorder = useRef(null);
  const timer = useRef(null);
  const alive = useRef(true);
  const [step, setStep] = useState("ready");
  const [message, setMessage] = useState("");
  const [noise, setNoise] = useState(null);
  const [capture, setCapture] = useState(null);
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      dialog.current?.close();
    };
  }, []);
  const record = async (seconds, source) => new Promise((resolve, reject) => {
    const track = source?.getAudioTracks?.()[0];
    if (!track || track.readyState !== "live") { reject(new Error("마이크를 연결하고 접근을 허용해 주세요.")); return; }
    const chunks = [];
    const value = new MediaRecorder(new MediaStream([track]));
    recorder.current = value;
    value.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    value.onerror = () => reject(new Error("녹음을 완료하지 못했어요."));
    value.onstop = () => resolve(new Blob(chunks, { type: value.mimeType }));
    value.start();
    timer.current = setTimeout(() => { if (value.state === "recording") value.stop(); }, seconds * 1000);
  });
  const startNoise = async () => {
    try {
      setMessage(""); setStep("connecting");
      const source = stream?.getAudioTracks?.()[0]?.readyState === "live" ? stream : await onRequestMedia();
      const before = captureSettings(source);
      if (!before) throw new Error("마이크를 연결해 주세요.");
      if (before.auto_gain_control !== false) throw new Error(voiceReason("automatic_gain_unverified"));
      setCapture(before); setStep("noise");
      const audio = await blobToWav(await record(2, source));
      if (!alive.current) return;
      if (!sameCapture(before, captureSettings(source))) throw new Error(voiceReason("capture_changed"));
      setNoise(audio); setStep("read");
    } catch (error) { if (alive.current) { setMessage(error.message); setStep("ready"); } }
  };
  const startSpeech = async () => {
    try {
      if (!sameCapture(capture, captureSettings(stream))) throw new Error(voiceReason("capture_changed"));
      setStep("speech");
      const speech = await blobToWav(await record(10, stream));
      if (!alive.current) return;
      if (!sameCapture(capture, captureSettings(stream))) throw new Error(voiceReason("capture_changed"));
      setStep("checking");
      const result = await calibrateVoice(session, noise, speech, capture);
      if (!alive.current) return;
      if (result.status !== "measured") throw new Error(voiceReason(result.reason));
      if (!sameCapture(capture, captureSettings(stream))) throw new Error(voiceReason("capture_changed"));
      onReady(result);
    } catch (error) { if (alive.current) { setMessage(error.message); setStep("ready"); } }
  };
  const busy = ["connecting", "noise", "speech", "checking"].includes(step);
  return <dialog ref={dialog} className="voice-check" aria-labelledby="voice-check-title" onCancel={(event) => event.preventDefault()}>
    <h2 id="voice-check-title">내 목소리의 기준을 확인해요</h2>
    <p>주변 소음을 확인한 뒤 평소 목소리로 문장을 읽어 주세요. 이 녹음은 목소리 크기를 비교하는 데 사용해요.</p>
    <div role="status" aria-live="polite">
      {step === "noise" && <p>2초 동안 조용히 기다려 주세요.</p>}
      {["read", "speech"].includes(step) && <blockquote>안녕하세요. 오늘 맡은 업무와 진행 상황을 말씀드리겠습니다.</blockquote>}
      {step === "speech" && <p>평소 목소리로 읽어 주세요. 10초 뒤 자동으로 끝나요.</p>}
      {step === "checking" && <p>녹음 상태를 확인하고 있어요.</p>}
    </div>
    {message && <p role="alert">{message}</p>}
    <div className="voice-check__actions">
      {step === "read" ? <Button onClick={startSpeech}>문장 읽기 시작</Button> : <Button disabled={busy} onClick={startNoise}>{busy ? "확인 중" : "마이크 확인 시작"}</Button>}
      <Button variant="outline" disabled={busy} onClick={onTextOnly}>목소리 분석 없이 연습</Button>
    </div>
    <p className="voice-check__note">마이크 확인을 건너뛰면 음성은 평가하지 않아요. 검사 녹음은 확인 후 삭제해요.</p>
  </dialog>;
}
