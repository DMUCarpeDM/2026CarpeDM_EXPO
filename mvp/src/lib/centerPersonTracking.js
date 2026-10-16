// Crop only the inference input; map landmarks back before drawing or scoring.
export const TRACKING_SCAN_CENTERS = [.5, .175, .825];

export function centeredRegion(width, height, centerX = .5) {
  return { x: Math.max(0, Math.min(width * .35, width * centerX - width * .325)),
    y: height * .175, width: width * .65, height: height * .65 };
}

export function drawCenteredInput(video, canvas, centerX = .5) {
  const width = video.videoWidth || video.width, height = video.videoHeight || video.height;
  const region = centeredRegion(width, height, centerX);
  canvas.width = Math.round(region.width);
  canvas.height = Math.round(region.height);
  canvas.getContext("2d").drawImage(video, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  return region;
}

export function mapRegionLandmarks(points, region, width, height) {
  return points.map(p => ({ ...p, x: (region.x + p.x * region.width) / width,
    y: (region.y + p.y * region.height) / height, z: p.z == null ? p.z : p.z * region.width / width }));
}

export function centralPose(result) {
  let best = null;
  for (let index = 0; index < (result.landmarks?.length || 0); index++) {
    const landmarks = result.landmarks[index];
    const left = landmarks[11], right = landmarks[12];
    if (!left || !right || (left.visibility ?? 1) < .5 || (right.visibility ?? 1) < .5) continue;
    const center = (left.x + right.x) / 2;
    if (!Number.isFinite(center) || center < 0 || center > 1) continue;
    const distance = Math.abs(center - .5);
    // Prefer the center, but keep any visible person eligible for reacquisition.
    if (best && distance >= best.distance) continue;
    best = { landmarks, worldLandmarks: result.worldLandmarks?.[index], distance };
  }
  return best;
}

export function smallPose(pose) {
  return !pose || Math.abs(pose.landmarks[11].x - pose.landmarks[12].x) < .08;
}

export function centralFace(faces = []) {
  const ranked = faces.filter(points => points?.length).map(points => {
    const xs = points.map(p => p.x);
    return { points, distance: Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - .5) };
  }).filter(face => Number.isFinite(face.distance) && face.distance <= .5).sort((a, b) => a.distance - b.distance);
  return ranked[0]?.points || null;
}
