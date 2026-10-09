export const MIRROR_SCENE_MS = 18000;
export const MIRROR_OVERVIEW_MS = MIRROR_SCENE_MS * 3 + 3000;
export function mirrorPhase(elapsed) {
  const time = Math.max(0, elapsed);
  if (time >= MIRROR_OVERVIEW_MS) return { kind: "complete", scene: 2, progress: 1, remaining: 0 };
  if (time >= MIRROR_SCENE_MS * 3) return { kind: "countdown", scene: 2, progress: 1, remaining: Math.ceil((MIRROR_OVERVIEW_MS - time) / 1000) };
  const scene = Math.floor(time / MIRROR_SCENE_MS);
  const withinScene = time - scene * MIRROR_SCENE_MS;
  return { kind: "scene", scene, progress: withinScene / MIRROR_SCENE_MS, remaining: Math.ceil((MIRROR_SCENE_MS - withinScene) / 1000) };
}
// Hidden tabs never consume reading time.
export function createVisibleClock(now = 0, visible = true) {
  let elapsed = 0, previous = now, running = visible;
  return { tick(time, nextVisible = running) {
    if (running) elapsed += Math.max(0, time - previous);
    previous = time; running = nextVisible;
    return elapsed;
  } };
}
export function isMirrorDeployment(search = globalThis.location?.search || "") {
  const params = new URLSearchParams(search);
  return params.get("mirror") === "1" && params.get("service") === "workplace";
}
export function hasCurrentCardConsent(card) {
  return Boolean(card?.uid && card?.consent_agreed === true && card?.consent_agreed_at && card?.issued_count > 0);
}
