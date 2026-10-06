export const MIRROR_OVERVIEW_MS = 43000;
const phases = [[0,2000,-1,"overview"],[2000,14000,0,"scene"],[14000,15000,1,"move"],[15000,27000,1,"scene"],[27000,28000,2,"move"],[28000,40000,2,"scene"],[40000,43000,2,"countdown"]];
export function mirrorPhase(elapsed) {
  const time = Math.max(0, elapsed);
  const phase = phases.find(([, end]) => time < end);
  if (!phase) return { kind: "complete", scene: 2, progress: 1, remaining: 0 };
  const [start, end, scene, kind] = phase;
  return { kind, scene, progress: (time - start) / (end - start), remaining: Math.ceil((end - time) / 1000) };
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
