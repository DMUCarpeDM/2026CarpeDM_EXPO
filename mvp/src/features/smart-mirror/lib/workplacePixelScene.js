// A scene lasts 12s: enter 2.4s, stop to read 7.2s, leave 2.4s.
export function pixelSceneState(phase, reduced = false, blocked = false, stopLeft = 42) {
  if (reduced || blocked || phase.kind === 'overview') return { left: stopLeft, walking: false };
  if (phase.kind === 'move') return { left: 8, walking: false };
  if (phase.kind !== 'scene') return { left: 82, walking: false };
  const progress = Math.max(0, Math.min(1, phase.progress));
  if (progress < .2) return { left: 8 + progress / .2 * (stopLeft - 8), walking: true };
  if (progress < .8) return { left: stopLeft, walking: false };
  return { left: stopLeft + (progress - .8) / .2 * (82 - stopLeft), walking: true };
}

export const PIXEL_ACTOR_WIDTH = 10;

// One arrival walks; the other two remain together in a separate lane.
export function anonymousSceneState(phase, index, reduced = false, blocked = false) {
  if (index > 0) return { left: 17 + (index - 1) * 12, walking: false, opacity: 1 };
  if (reduced || blocked || phase.kind === 'overview') return { left: 5, walking: false, opacity: 1 };
  const progress = Math.max(0, Math.min(1, phase.progress));
  const distance = progress * 110;
  return { left: distance, walking: phase.kind === 'scene', opacity: distance > 100 ? 0 : 1 };
}

export function conversationSceneState(phase, actor, counterpartLeft, reduced = false, blocked = false) {
  const active = !blocked && phase.kind === 'scene' && phase.progress >= .2 && phase.progress < .8 && !actor.walking && Math.abs(counterpartLeft - actor.left) <= PIXEL_ACTOR_WIDTH + 4;
  return { active, speaker: phase.progress < .5 ? 'counterpart' : 'participant', animated: active && !reduced };
}
