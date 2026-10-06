// A scene lasts 12s: enter 2.4s, stop to read 7.2s, leave 2.4s.
export function pixelSceneState(phase, reduced = false, blocked = false) {
  if (reduced || blocked || phase.kind === 'overview') return { left: 42, walking: false };
  if (phase.kind === 'move') return { left: 8, walking: false };
  if (phase.kind !== 'scene') return { left: 82, walking: false };
  const progress = Math.max(0, Math.min(1, phase.progress));
  if (progress < .2) return { left: 8 + progress / .2 * 34, walking: true };
  if (progress < .8) return { left: 42, walking: false };
  return { left: 42 + (progress - .8) / .2 * 40, walking: true };
}

// Background arrivals use separate lanes and never cross the participant's reading position.
export function anonymousSceneState(phase, index, reduced = false, blocked = false) {
  if (reduced || blocked || phase.kind === 'overview') return { left: 12 + index * 13, walking: false, opacity: 1 };
  const progress = Math.max(0, Math.min(1, phase.progress));
  const distance = progress * 110 - index * 11;
  return { left: distance, walking: true, opacity: distance < -9 || distance > 100 ? 0 : 1 };
}
