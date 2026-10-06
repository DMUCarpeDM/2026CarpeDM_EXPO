import { createVisibleClock } from "../../features/smart-mirror/lib/workplaceMirrorTimeline";
import { useEffect, useRef, useState } from "react";
import { Soundwave } from "reicon-react/icons/Soundwave";
import { ChatRound } from "reicon-react/icons/ChatRound";
import microphoneIllustration from "../../assets/voice-check-microphone.png";
import { Button } from "../ui/shadcn";
import { blobToWav } from "../../lib/audioWav";
import { calibrateVoice } from "../../lib/pocApi";
import { captureSettings, sameCapture, voiceReason } from "../../lib/voiceCapture";
import "../../styles/voice-measurement.css";

export function MicrophoneCheck({ automatic = false, session, stream, onRequestMedia, onReady, onTextOnly }) {
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
  useEffect(() => {
    if (!automatic || message || !["ready", "read"].includes(step)) return undefined;
    // Leave time to read the instruction before each automatic recording.
    const clock = createVisibleClock(performance.now(), !document.hidden);
    let started = false;
    const tick = () => {
      if (!started && clock.tick(performance.now(), !document.hidden) >= 5000 && !document.hidden) {
        started = true;
        void (step === "read" ? startSpeech() : startNoise());
      }
    };
    const interval = setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [automatic, step, message]);
  const busy = ["connecting", "noise", "speech", "checking"].includes(step);
  return <dialog ref={dialog} className="voice-check" aria-labelledby="voice-check-title" onCancel={(event) => event.preventDefault()}>
    <div className="voice-check__layout">
    <aside className="voice-check__intro">
      <img src={microphoneIllustration} className="voice-check__microphone" alt="" />
      <div><h3>연습 전 목소리 확인</h3><p>목소리 크기를 비교할<br />기준을 준비해요.</p></div>
    </aside>
    <div className="voice-check__content">
    <h2 id="voice-check-title">내 목소리의 기준을 확인해요</h2>
    <p>주변 소음을 확인한 뒤 평소 목소리로 문장을 읽어 주세요. 이 녹음은 목소리 크기를 비교하는 데 사용해요.</p>
    <ol className="voice-check__steps" aria-label="마이크 확인 순서">
      <li aria-current={["ready", "connecting", "noise"].includes(step) ? "step" : undefined}><Soundwave size={24} style={{ color: "var(--voice-accent)" }} aria-hidden="true" /><div><strong>주변 소음 2초</strong><span>주변 소음을 짧게 확인해요.</span></div></li>
      <li aria-current={["read", "speech", "checking"].includes(step) ? "step" : undefined}><ChatRound size={30} style={{ color: "var(--voice-accent)" }} aria-hidden="true" /><div><strong>문장 읽기 10초</strong><span>화면에 표시된 문장을 평소 목소리로 읽어 주세요.</span></div></li>
    </ol>
    <div role="status" aria-live="polite">
      {step === "noise" && <p>2초 동안 조용히 기다려 주세요.</p>}
      {["read", "speech"].includes(step) && <blockquote>안녕하세요. 오늘 맡은 업무와 진행 상황을 말씀드리겠습니다.</blockquote>}
      {step === "speech" && <p>평소 목소리로 읽어 주세요. 10초 뒤 자동으로 끝나요.</p>}
      {step === "checking" && <p>녹음 상태를 확인하고 있어요.</p>}
    </div>
    {message && <p role="alert">{message}</p>}
    {automatic ? <p role="status">{message ? "운영자에게 마이크 확인을 요청해 주세요." : "잠시 후 자동으로 확인해요. 화면의 안내를 따라 주세요."}</p> : <div className="voice-check__actions">
      {step === "read" ? <Button onClick={startSpeech}>문장 읽기 시작</Button> : <Button disabled={busy} onClick={startNoise}>{busy ? "확인 중" : "마이크 확인 시작"}</Button>}
      <Button variant="outline" disabled={busy} onClick={onTextOnly}>목소리 분석 없이 연습</Button>
    </div>}
    <p className="voice-check__note">마이크 확인을 건너뛰면 음성은 평가하지 않아요. 검사 녹음은 확인 후 삭제해요.</p>
    </div>
    </div>
  </dialog>;
}
