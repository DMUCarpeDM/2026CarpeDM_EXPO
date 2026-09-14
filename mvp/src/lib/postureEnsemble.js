// Carpediem.ipynb: normalized image-space landmarks (not worldLandmarks).
export const POSE_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24];
export function postureFeatures(landmarks) {
  const points = POSE_INDICES.map(i => landmarks?.[i]);
  if (points.some(p => !p || ![p.x,p.y,p.z].every(Number.isFinite) || p.x < -.05 || p.x > 1.05 || p.y < -.05 || p.y > 1.05)) return null;
  const center = ['x','y','z'].map(k => (points[1][k]+points[2][k])/2);
  const width = Math.hypot(...['x','y','z'].map(k => points[1][k]-points[2][k]));
  if (width < .005) return null;
  return points.flatMap(p => ['x','y','z'].map((k,i) => (p[k]-center[i])/width));
}
