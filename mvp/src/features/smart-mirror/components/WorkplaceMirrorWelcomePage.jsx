import { useEffect, useRef, useState } from "react";
import { CounterpartVideo } from "../../../components/practice/CounterpartVideo";
import welcomeAudio from "../assets/welcome-iris.wav";
import "../styles/workplace-mirror-nfc.css";
import "../styles/workplace-mirror-welcome.css";

export function WorkplaceMirrorWelcomePage({ onStart }) {
  const audioRef = useRef(null);
  const startedRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    audio.play().catch(() => setSpeaking(false));
    return () => { audio.pause(); audio.currentTime = 0; };
  }, []);
  const start = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    audioRef.current?.pause();
    onStart();
  };
  return <section className="mirror-welcome" aria-label="미러팅 시연 안내">
    <CounterpartVideo characterId="park_senior" category="morning" name="시연 안내 인물" state={speaking ? "speaking" : "listening"} />
    <audio ref={audioRef} src={welcomeAudio} preload="auto" onPlaying={() => setSpeaking(true)} onEnded={() => setSpeaking(false)} onError={() => setSpeaking(false)} />
    <button className="mirror-welcome-start" type="button" onClick={start} aria-label="화면을 눌러 시연 시작" aria-describedby="mirror-welcome-disclosure" />
    <span className="screen-reader-note" id="mirror-welcome-disclosure">화면을 누르거나 NFC를 태그하면 카메라·음성 분석과 결과 처리에 동의하고 체험 준비로 이동합니다.</span>
  </section>;
}
