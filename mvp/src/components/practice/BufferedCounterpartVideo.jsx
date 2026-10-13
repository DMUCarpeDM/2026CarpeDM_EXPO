import { useEffect, useRef, useState } from "react";

// Keep the visible frame until the next clip can play; only two decoders are retained.
export function BufferedCounterpartVideo({ source, name, paused, reducedMotion, loop, onEnded, onError }) {
  const [sources, setSources] = useState([source, null]);
  const [active, setActive] = useState(0);
  const videos = useRef([]);
  const activeRef = useRef(0);
  const pending = useRef(null);
  const desired = useRef(source);
  const stopped = useRef(paused || reducedMotion);
  desired.current = source;
  stopped.current = paused || reducedMotion;

  useEffect(() => {
    if (sources[activeRef.current] === source) {
      pending.current = null;
      return;
    }
    const next = 1 - activeRef.current;
    pending.current = next;
    setSources(previous => previous.map((value, index) => index === next ? source : value));
  }, [source]);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      if (stopped.current || index !== active) video.pause();
      else video.play().catch(onError);
    });
  }, [active, paused, reducedMotion, onError]);

  // 이미 버퍼에 로드된 듣기 영상으로 돌아오면 loadeddata가 다시 발생하지 않는다.
  useEffect(() => {
    const next = pending.current;
    if (next !== null && sources[next] === source) void reveal(next);
  }, [sources, source]);

  const reveal = async (index) => {
    const video = videos.current[index];
    if (!video || sources[index] !== desired.current || video.readyState < 2) return;
    try {
      if (!stopped.current) await video.play();
      if (sources[index] !== desired.current || (index !== activeRef.current && pending.current !== index)) {
        video.pause();
        return;
      }
      activeRef.current = index;
      pending.current = null;
      setActive(index);
      if (stopped.current) video.pause();
    } catch { onError?.(); }
  };

  return <div className="counterpart-video-transition" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    {sources.map((clip, index) => clip && <video
      key={index}
      ref={video => { videos.current[index] = video; }}
      className="camera-video counterpart-video is-live"
      src={clip}
      preload="auto"
      loop={index === active && clip === source ? loop : true}
      muted
      playsInline
      aria-hidden={index !== active}
      aria-label={index === active ? `${name}의 반응 영상` : undefined}
      style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", opacity: index === active ? 1 : 0, transition: reducedMotion ? "none" : "opacity 180ms ease-out" }}
      onLoadedData={() => { void reveal(index); }}
      onCanPlay={() => { if (pending.current === index) void reveal(index); }}
      onEnded={() => { if (index === activeRef.current && clip === desired.current) onEnded?.(); }}
      onError={() => { if (clip === desired.current) onError?.(); }}
    />)}
  </div>;
}
