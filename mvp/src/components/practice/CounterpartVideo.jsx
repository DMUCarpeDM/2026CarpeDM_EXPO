import { useEffect, useRef, useState } from "react";
import { mediaById } from "../../data/characterMedia";

/** AI 상대의 반응 영상 — 듣기/말하기/긍정/부정 4상태를 클립으로 전환한다.
 *  자산은 data/characterMedia.js 등록부에서 character_id로 찾는다(팀장 전용 아님).
 *  등록이 없으면 렌더하지 않는다 — 호출부가 hasCharacterVideo로 먼저 거른다. */
export function CounterpartVideo({ characterId, state = "listening", name = "AI 상대", paused = false, onReactionComplete }) {
  const videoRef = useRef(null);
  const previousSourceRef = useRef("");
  const [failed, setFailed] = useState(false);
  const media = mediaById(characterId);
  const clips = media?.videos;
  const source = clips ? (clips[state] || clips.listening) : "";
  const isReaction = state === "positive" || state === "negative";

  useEffect(() => {
    setFailed(false);
    const video = videoRef.current;
    if (!video || !source) return undefined;
    if (paused) { video.pause(); return undefined; }
    if (previousSourceRef.current !== source) {
      video.currentTime = 0;
      previousSourceRef.current = source;
    }
    video.play().catch(() => setFailed(true));
    return undefined;
  }, [source, paused]);

  if (!clips) return null;
  // 재생 실패(코덱·자동재생 차단)는 같은 인물의 정지 초상으로 대체 — 빈 화면을 만들지 않는다
  if (failed && media?.portrait) {
    return <img className="camera-video counterpart-video is-live" src={media.portrait} alt={`${name} 프로필`} />;
  }

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
