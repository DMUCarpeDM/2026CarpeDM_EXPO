import { useEffect, useRef, useState } from "react";
import { mediaById } from "../../data/characterMedia";

function ChromaKeyVideo({ source, name, paused, loop, onEnded, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const onErrorRef = useRef(onError);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;

    let active = true;
    let lastDraw = 0;
    const draw = (timestamp = 0) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && timestamp - lastDraw >= 33) {
        const width = Math.min(video.videoWidth || 960, 960);
        const height = Math.round(width * ((video.videoHeight || 540) / (video.videoWidth || 960)));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(video, 0, 0, width, height);
        const frame = context.getImageData(0, 0, width, height);
        const pixels = frame.data;
        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const greenDominance = green - Math.max(red, blue);
          if (green > 20 && greenDominance > 1) {
            const neutral = Math.max(red, blue);
            pixels[index + 1] = neutral;
            if (greenDominance > 4) {
              const matte = Math.min(1, (greenDominance - 4) / 48);
              pixels[index + 3] = Math.round(pixels[index + 3] * (1 - matte));
            }
          }
        }
        context.putImageData(frame, 0, 0);
        lastDraw = timestamp;
      }
      if (!video.paused && !video.ended) frameRef.current = window.requestAnimationFrame(draw);
    };
    const start = () => {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(draw);
    };
    const paintFirstFrame = () => draw(34);

    video.addEventListener("play", start);
    video.addEventListener("loadeddata", paintFirstFrame);
    if (!paused) video.play().then(() => { if (active) start(); }).catch(() => { if (active) onErrorRef.current?.(); });
    return () => {
      active = false;
      window.cancelAnimationFrame(frameRef.current);
      video.removeEventListener("play", start);
      video.removeEventListener("loadeddata", paintFirstFrame);
      video.pause();
    };
  }, [source, paused]);

  return <div className="counterpart-video-stage">
    <video
      ref={videoRef}
      className="counterpart-video-source"
      src={source}
      autoPlay
      loop={loop}
      muted
      playsInline
      aria-label={`${name}의 반응 영상`}
      onEnded={onEnded}
      onError={onError}
    />
    <canvas ref={canvasRef} className="camera-video counterpart-video counterpart-video-canvas is-live" aria-hidden="true" />
  </div>;
}

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
  const reactionStates = media?.reactionStates || ["positive", "negative"];
  const isReaction = reactionStates.includes(state);

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

  if (media?.chromaKey) {
    return <ChromaKeyVideo
      source={source}
      name={name}
      paused={paused}
      loop={!isReaction}
      onEnded={() => { if (isReaction) onReactionComplete?.(); }}
      onError={() => setFailed(true)}
    />;
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
