import { activeSubtitleIndex, speechSubtitleSegments } from "../../../lib/speechSubtitleSegments.js";

export function MirrorSubtitles({ text, playback }) {
  const segments = speechSubtitleSegments(text);
  const current = playback?.text === text;
  const active = activeSubtitleIndex(segments, current ? playback.charIndex : 0);
  const ended = current && playback.status === "ended";
  return <h1 id="mirror-dialogue-title" className="simulation-dialogue-text" data-visible="true">
    {segments.map((segment, index) => (
      <span key={`${text}:${index}`} data-focus={ended || index < active ? "past" : "active"}>{segment.text}</span>
    ))}
  </h1>;
}
