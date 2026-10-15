import { useEffect, useRef } from "react";
import welcomeVideo from "../assets/welcome-vertex.mp4";
import "../styles/workplace-mirror-nfc.css";
import "../styles/workplace-mirror-welcome.css";

export function WorkplaceMirrorWelcomePage({ onStart }) {
  const videoRef = useRef(null);
  const startedRef = useRef(false);
  useEffect(() => {
    const audio = videoRef.current;
    let disposed = false;
    const muteOnM = (event) => {
      if (event.key?.toLowerCase() !== "m" || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      audio.muted = true;
    };
    window.addEventListener("keydown", muteOnM);
    const play = () => {
      if (startedRef.current || !audio.paused || document.hidden) return;
      audio.muted = false;
      audio.currentTime = 0;
      audio.play().catch(() => {
        if (!disposed) { audio.muted = true; void audio.play().catch(() => {}); }
      });
    };
    play();
    return () => {
      disposed = true;
      window.removeEventListener("keydown", muteOnM);
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);
  const start = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    videoRef.current?.pause();
    onStart();
  };
  return <section className="mirror-welcome" aria-label="미러팅 시연 안내">
    <video ref={videoRef} className="mirror-welcome-video" src={welcomeVideo} playsInline preload="auto" aria-label="시연 안내 영상" />
    <button className="mirror-welcome-start" type="button" onClick={start} aria-label="화면을 눌러 시연 시작" aria-describedby="mirror-welcome-disclosure" />
    <span className="screen-reader-note" id="mirror-welcome-disclosure">화면을 누르거나 NFC를 태그하면 카메라·음성 분석과 결과 처리에 동의하고 체험 준비로 이동합니다.</span>
  </section>;
}
