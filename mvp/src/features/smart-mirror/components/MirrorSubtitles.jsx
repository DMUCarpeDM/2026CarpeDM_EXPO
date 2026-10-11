import { activeSubtitleIndex, speechSubtitleSegments } from "../../../lib/speechSubtitleSegments.js";

export function MirrorSubtitles({ text, playback }) {
  const segments = speechSubtitleSegments(text);
  const current = playback?.text === text;
  const textOnly = !playback || (current && playback.status === "unavailable");
  const visible = textOnly || (current && playback.status === "playing");
  const active = activeSubtitleIndex(segments, current ? playback.charIndex : 0);
  return <h1 id="mirror-dialogue-title" className="simulation-dialogue-text" data-visible={visible}>
    {segments.map((segment, index) => {
      const end = segments[index + 1]?.start ?? text.length;
      const progress = textOnly ? 0 : Math.max(0, Math.min(1, ((playback?.charIndex ?? 0) - segment.start) / Math.max(1, end - segment.start)));
      return <span key={index} data-focus={textOnly || index === active ? "active" : index < active ? "past" : "upcoming"} data-tracking={!textOnly && index === active} style={{ "--speech-progress": progress }}>{segment.text}</span>;
    })}
  </h1>;
}
