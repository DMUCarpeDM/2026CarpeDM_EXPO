import { createVisibleClock } from "../../features/smart-mirror/lib/workplaceMirrorTimeline";
import { MirrorGlassModal } from "../../features/smart-mirror/components/MirrorGlassModal";
import { useEffect, useRef, useState } from "react";
import { Soundwave } from "reicon-react/icons/Soundwave";
import { ChatRound } from "reicon-react/icons/ChatRound";
import microphoneIllustration from "../../assets/voice-check-microphone.png";
import { Button } from "../ui/shadcn";
import { blobToWav } from "../../lib/audioWav";
import { calibrateVoice } from "../../lib/pocApi";
import { captureSettings, sameCapture, voiceReason } from "../../lib/voiceCapture";
import "../../styles/voice-measurement.css";
import "../../features/smart-mirror/styles/workplace-mirror-microphone.css";

export function MicrophoneCheck({ mirror = false, automatic = false, session, stream, onRequestMedia, onReady, onTextOnly, onContinueWithoutCalibration }) {
  const dialog = useRef(null);
  const recorder = useRef(null);
  const timer = useRef(null);
  const alive = useRef(true);
  const finished = useRef(false);
  const continueWithoutCalibration = useRef(onContinueWithoutCalibration);
  continueWithoutCalibration.current = onContinueWithoutCalibration;
  const [elapsed, setElapsed] = useState(0);
  const [step, setStep] = useState("ready");
  const [message, setMessage] = useState("");
  const [noise, setNoise] = useState(null);
  const [capture, setCapture] = useState(null);
  useEffect(() => {
    alive.current = true;
    finished.current = false;
    dialog.current?.showModal();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      dialog.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!mirror) return undefined;
    const started = performance.now();
    const interval = setInterval(() => setElapsed(Math.min(10000, performance.now() - started)), 100);
    const deadline = setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      continueWithoutCalibration.current?.();
    }, 10000);
    return () => { clearInterval(interval); clearTimeout(deadline); };
  }, [mirror]);
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
      if (!alive.current || finished.current) return;
      const before = captureSettings(source);
      if (!before) throw new Error("마이크를 연결해 주세요.");
      if (before.auto_gain_control !== false) throw new Error(voiceReason("automatic_gain_unverified"));
      setCapture(before); setStep("noise");
      const audio = await blobToWav(await record(2, source));
      if (!alive.current || finished.current) return;
      if (!sameCapture(before, captureSettings(source))) throw new Error(voiceReason("capture_changed"));
      setNoise(audio); setStep("read");
    } catch (error) { if (alive.current && !finished.current) { setMessage(error.message); setStep("ready"); } }
  };
  const startSpeech = async () => {
    try {
      if (!sameCapture(capture, captureSettings(stream))) throw new Error(voiceReason("capture_changed"));
      setStep("speech");
      const speech = await blobToWav(await record(mirror ? 4 : 10, stream));
      if (!alive.current || finished.current) return;
      if (!sameCapture(capture, captureSettings(stream))) throw new Error(voiceReason("capture_changed"));
      setStep("checking");
      const result = await calibrateVoice(session, noise, speech, capture);
      if (!alive.current || finished.current) return;
      if (result.status !== "measured") throw new Error(voiceReason(result.reason));
      if (!sameCapture(capture, captureSettings(stream))) throw new Error(voiceReason("capture_changed"));
      finished.current = true;
      onReady(result);
    } catch (error) { if (alive.current && !finished.current) { setMessage(error.message); setStep("ready"); } }
  };
  useEffect(() => {
    if (!automatic || message || finished.current || !["ready", "read"].includes(step)) return undefined;
    // Leave time to read the instruction before each automatic recording.
    const clock = createVisibleClock(performance.now(), !document.hidden);
    let started = false;
    const tick = () => {
      if (!started && clock.tick(performance.now(), !document.hidden) >= (mirror ? step === "read" ? 750 : 500 : 5000) && !document.hidden) {
        started = true;
        void (step === "read" ? startSpeech() : startNoise());
      }
    };
    const interval = setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [automatic, mirror, step, message]);
  const busy = ["connecting", "noise", "speech", "checking"].includes(step);
  if (mirror) return <MirrorGlassModal className="mirror-microphone-check" labelledBy="voice-check-title" describedBy="mirror-microphone-instruction">
    <div className="overview-card-context">
      <p className="overview-scene-meta"><span className="overview-scene-badge">대화 준비 · 마이크 확인</span><span>최대 10초</span></p>
      <div className="mirror-microphone-heading"><Soundwave aria-hidden="true" /><h2 id="voice-check-title">내 목소리를 확인할게요.</h2></div>
      <p id="mirror-microphone-instruction" className="mirror-microphone-instruction" role="status">{message ? "기준 확인 없이 대화를 이어갈게요." : ["ready", "connecting", "noise"].includes(step) ? "잠시 조용히 기다려 주세요." : step === "checking" ? "녹음 상태를 확인하고 있어요." : "아래 문장을 평소 목소리로 읽어 주세요."}</p>
    </div>
    <ol className="mirror-microphone-steps" aria-label="마이크 확인 순서">
      <li aria-current={["ready", "connecting", "noise"].includes(step) ? "step" : undefined}><span>01</span><div><strong>주변 소음</strong><small>2초 · 조용히 기다리기</small></div></li>
      <li aria-current={["read", "speech", "checking"].includes(step) ? "step" : undefined}><span>02</span><div><strong>목소리 확인</strong><small>4초 · 문장 읽기</small></div></li>
    </ol>
    <blockquote className="mirror-microphone-sentence" data-active={["read", "speech"].includes(step)}>안녕하세요.<br />오늘 업무를 확인하겠습니다.</blockquote>
    {message && <p className="mirror-microphone-error" role="alert">{message}</p>}
    <div className="mirror-microphone-footer">
      <p className="mirror-briefing-next">{Math.max(0, Math.ceil((10000 - elapsed) / 1000))}초 이내에 자동으로 넘어가요.</p>
      <div className="overview-step-track" role="progressbar" aria-label="마이크 확인 진행" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.floor(elapsed / 1000)}><i style={{ transform: `scaleX(${elapsed / 10000})` }} /></div>
      <p className="mirror-microphone-note">확인되지 않은 목소리 항목은 점수에서 제외해요.</p>
    </div>
  </MirrorGlassModal>;
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
