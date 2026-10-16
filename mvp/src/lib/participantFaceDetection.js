import { drawParticipantHead, participantFace } from './participantTracking.js';
import { mapRegionLandmarks } from './centerPersonTracking.js';

// Enlarge only the locked participant's head for inference; keep original display coordinates.
export function detectParticipantFace(detector, video, canvas, participant, timestamp) {
  if (!detector || !participant) return null;
  const region = drawParticipantHead(video, canvas, participant);
  if (region) {
    const result = detector.detectForVideo(canvas, timestamp);
    const mapped = (result.faceLandmarks || []).map(points =>
      mapRegionLandmarks(points, region, video.videoWidth, video.videoHeight));
    const face = participantFace(mapped, participant);
    if (face) return face;
  }
  return participantFace(detector.detectForVideo(video, timestamp + .001).faceLandmarks || [], participant);
}
