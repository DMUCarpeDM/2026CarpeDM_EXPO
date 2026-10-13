import { useEffect, useRef, useState } from "react";
import { CounterpartVideo } from "../../../components/practice/CounterpartVideo";
import welcomeAudio from "../assets/welcome-iris.wav";
import "../styles/workplace-mirror-nfc.css";
import "../styles/workplace-mirror-welcome.css";

export function WorkplaceMirrorWelcomePage({ onStart }) {
  const audioRef = useRef(null);
  const startedRef = useRef(false);
  const repeatTimerRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    let disposed = false;
    const play = () => {
      if (disposed || startedRef.current || !audio.paused) return;
      audio.currentTime = 0;
      audio.play().catch(() => { if (!disposed) { setSpeaking(false); scheduleRepeat(); } });
    };
    const scheduleRepeat = () => {
      window.clearTimeout(repeatTimerRef.current);
      if (!disposed && !startedRef.current) repeatTimerRef.current = window.setTimeout(play, 10_000);
    };
    audio.addEventListener("ended", scheduleRepeat);
    play();
    // Leave a full ten-second silence after each completed announcement.
    return () => {
      disposed = true;
      window.clearTimeout(repeatTimerRef.current);
      audio.removeEventListener("ended", scheduleRepeat);
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== "KeyM" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
      event.preventDefault();
      setMuted((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const start = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    window.clearTimeout(repeatTimerRef.current);
    audioRef.current?.pause();
    onStart();
  };
  return <section className="mirror-welcome" aria-label="미러팅 시연 안내">
    <CounterpartVideo characterId="park_senior" category="morning" name="시연 안내 인물" state={speaking ? "speaking" : "listening"} />
    <audio ref={audioRef} src={welcomeAudio} preload="auto" muted={muted} onPlaying={() => setSpeaking(true)} onEnded={() => setSpeaking(false)} onError={() => setSpeaking(false)} />
    <span className="screen-reader-note" role="status">{muted ? "안내 음소거 켜짐. M 키로 해제" : "안내 음소거 꺼짐. M 키로 음소거"}</span>
    <button className="mirror-welcome-start" type="button" onClick={start} aria-label="화면을 눌러 시연 시작" aria-describedby="mirror-welcome-disclosure" />
    <span className="screen-reader-note" id="mirror-welcome-disclosure">화면을 누르거나 NFC를 태그하면 카메라·음성 분석과 결과 처리에 동의하고 체험 준비로 이동합니다.</span>
  </section>;
}
