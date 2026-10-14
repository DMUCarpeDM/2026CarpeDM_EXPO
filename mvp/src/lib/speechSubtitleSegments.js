export function speechSubtitleSegments(text) {
  return [...text.matchAll(/[^.!?。！？]+[.!?。！？]*/g)].map(match => ({
    text: match[0].trim(), start: match.index,
  })).filter(segment => segment.text);
}

export function activeSubtitleIndex(segments, charIndex) {
  return Math.max(0, segments.findLastIndex(segment => segment.start <= charIndex));
}

// Short cues preserve original offsets so TTS can advance without scrolling.
export function speechSubtitleCues(text, limit = 28) {
  return speechSubtitleSegments(text).flatMap(segment => {
    const cues = [];
    let offset = 0;
    // segment.start includes leading whitespace in the original sentence.
    const leading = text.slice(segment.start).search(/\S/);
    while (offset < segment.text.length) {
      let end = Math.min(offset + limit, segment.text.length);
      if (end < segment.text.length) {
        const space = segment.text.lastIndexOf(" ", end);
        if (space > offset + limit / 2) end = space;
      }
      const chunk = segment.text.slice(offset, end);
      if (chunk.trim()) cues.push({ text: chunk.trim(), start: segment.start + leading + offset });
      offset = end;
      while (segment.text[offset] === " ") offset++;
    }
    return cues;
  });
}
