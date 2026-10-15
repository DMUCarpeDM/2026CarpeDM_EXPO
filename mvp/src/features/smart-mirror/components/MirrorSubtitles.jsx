import { useEffect, useState } from "react";
import { activeSubtitleIndex, speechSubtitleCues } from "../../../lib/speechSubtitleSegments.js";

export function MirrorSubtitles({ text, playback }) {
  const segments = speechSubtitleCues(text);
  const current = playback?.text === text;
  const textOnly = !playback || (current && playback.status === "unavailable");
  const visible = textOnly || (current && ["playing", "ended"].includes(playback.status));
  const [readingIndex, setReadingIndex] = useState(0);
  useEffect(() => {
    setReadingIndex(0);
    if (!textOnly || segments.length < 2) return undefined;
    const timer = setInterval(() => setReadingIndex(index => (index + 1) % segments.length), 4500);
    return () => clearInterval(timer);
  }, [text, textOnly, segments.length]);
  const active = textOnly ? Math.min(readingIndex, segments.length - 1) : activeSubtitleIndex(segments, current ? playback.charIndex : 0);
  const [shown, setShown] = useState({ text, index: active, fading: false });
  useEffect(() => {
    const timers = [];
    const sameText = shown.text === text;
    const changingSentence = sameText && shown.index !== active;
    if (!sameText) setShown({ text, index: active, fading: false });
    else if (changingSentence) {
      setShown(previous => ({ ...previous, fading: true }));
      timers.push(setTimeout(() => setShown({ text, index: active, fading: false }), 360));
    } else if (!current || playback?.status !== "ended") {
      setShown(previous => ({ ...previous, fading: false }));
    }
    // Let the final sentence remain readable after the last audio sample.
    if (current && playback?.status === "ended") {
      timers.push(setTimeout(() => setShown(previous => ({ ...previous, fading: true })), (changingSentence ? 360 : 0) + 700));
    }
    return () => timers.forEach(clearTimeout);
  }, [text, active, current, playback?.status, textOnly]);
  const displayed = shown.text === text ? shown : { text, index: active, fading: false };
  return <h1 id="mirror-dialogue-title" className="simulation-dialogue-text" data-visible={visible}>
    {segments.map((segment, index) => {
      if (index !== displayed.index) return null;
      const end = segments[index + 1]?.start ?? text.length;
      const progress = textOnly ? 0 : Math.max(0, Math.min(1, ((playback?.charIndex ?? 0) - segment.start) / Math.max(1, end - segment.start)));
      return <span key={`${text}:${index}`} data-focus={displayed.fading ? "fading" : "active"} data-tracking={!textOnly && index === active && playback?.status === "playing"} style={{ "--speech-progress": progress }}>{segment.text}</span>;
    })}
  </h1>;
}
