export function speechSubtitleSegments(text) {
  return [...text.matchAll(/[^.!?。！？]+[.!?。！？]*/g)].map(match => ({
    text: match[0].trim(), start: match.index,
  })).filter(segment => segment.text);
}

export function activeSubtitleIndex(segments, charIndex) {
  return Math.max(0, segments.findLastIndex(segment => segment.start <= charIndex));
}
