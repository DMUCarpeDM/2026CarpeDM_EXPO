import { useEffect, useRef, useState } from "react";
import teamLeadPortrait from "../../assets/team-lead-video-portrait.png";
import teamLeadListening from "../../assets/team-lead-videos/team-lead-listening.mp4";
import teamLeadNegative from "../../assets/team-lead-videos/team-lead-negative.mp4";
import teamLeadPositive from "../../assets/team-lead-videos/team-lead-positive.mp4";
import teamLeadSpeaking from "../../assets/team-lead-videos/team-lead-speaking.mp4";

const VIDEO_BY_STATE = {
  speaking: teamLeadSpeaking,
  listening: teamLeadListening,
  positive: teamLeadPositive,
  negative: teamLeadNegative,
};

export function TeamLeadVideo({ state = "listening", name = "AI 팀장", paused = false, onReactionComplete }) {
  const videoRef = useRef(null);
  const previousSourceRef = useRef("");
  const [failed, setFailed] = useState(false);
  const source = VIDEO_BY_STATE[state] || VIDEO_BY_STATE.listening;
  const isReaction = state === "positive" || state === "negative";

  useEffect(() => {
    setFailed(false);
    const video = videoRef.current;
    if (!video) return;
    if (paused) { video.pause(); return undefined; }
    if (previousSourceRef.current !== source) {
      video.currentTime = 0;
      previousSourceRef.current = source;
    }
    video.play().catch(() => setFailed(true));
  }, [source, paused]);

  if (failed) return <img className="camera-video counterpart-video is-live" src={teamLeadPortrait} alt={`${name} 프로필`} />;

  return <video
    ref={videoRef}
    className="camera-video counterpart-video is-live"
    src={source}
    autoPlay
    loop={!isReaction}
    muted
    playsInline
    aria-label={`${name}의 반응 영상`}
    onEnded={() => { if (isReaction) onReactionComplete?.(); }}
    onError={() => setFailed(true)}
  />;
}
