// Spatial continuity only: when identity is ambiguous, withhold all samples.
function descriptor(pose) {
  const p = pose?.landmarks, a = p?.[11], b = p?.[12];
  if (!a || !b || (a.visibility ?? 1) < .5 || (b.visibility ?? 1) < .5) return null;
  const width = Math.hypot(a.x - b.x, a.y - b.y);
  if (width < .025) return null;
  return { pose, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function createParticipantTracker() {
  let target = null, pending = null, lastSeen = -Infinity, current = null, generation = 0, recovery = null;
  return {
    get current() { return current; },
    get generation() { return generation; },
    reset() { target = pending = current = null; lastSeen = -Infinity; generation += 1; recovery = null; },
    update(poses, now) {
      current = null;
      const candidates = poses.map(descriptor).filter(Boolean);
      if (target) {
        const ranked = candidates.map(c => ({ c, score: distance(c, target) / target.width + Math.abs(Math.log(c.width / target.width)) }))
          .filter(({ c }) => distance(c, target) < Math.max(.035, target.width * .6) && c.width / target.width > .65 && c.width / target.width < 1.55)
          .sort((a, b) => a.score - b.score);
        if (!ranked.length) { recovery = null; return null; }
        if (ranked[1] && ranked[1].score - ranked[0].score < .35) {
          recovery = null; lastSeen = Math.min(lastSeen, now - 501); return null;
        }
        const match = ranked[0].c;
        // Reconnect automatically only after a consistent match to the retained target.
        if (now - lastSeen > 500) {
          if (!recovery || now - recovery.last > 500 || distance(match, recovery.body) > Math.max(.025, target.width * .25)) {
            recovery = { body: match, since: now, last: now }; return null;
          }
          recovery.body = match; recovery.last = now;
          if (now - recovery.since < 300) return null;
        }
        recovery = null; target = match; lastSeen = now; current = target.pose;
        return current;
      }
      const ranked = candidates.filter(c => Math.abs(c.x - .5) < .18).sort((a, b) => Math.abs(a.x - .5) - Math.abs(b.x - .5));
      if (!ranked.length || (ranked[1] && Math.abs(ranked[1].x - .5) - Math.abs(ranked[0].x - .5) < .08)) { pending = null; return null; }
      const candidate = ranked[0];
      if (!pending || now - pending.last > 500 || distance(candidate, pending.body) > Math.max(.04, candidate.width * .5) || Math.abs(Math.log(candidate.width / pending.body.width)) > .3) {
        pending = { body: candidate, since: now, last: now }; return null;
      }
      pending.body = candidate; pending.last = now;
      if (now - pending.since < 1000) return null;
      target = candidate; current = target.pose; lastSeen = now; pending = null; generation += 1;
      return current;
    },
  };
}
export function participantFace(faces, pose) {
  const body = descriptor(pose), nose = pose?.landmarks?.[0];
  if (!body || !nose || (nose.visibility ?? 1) < .35) return null;
  const matches = faces.filter(points => points?.length).filter(points => {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    return distance(center, nose) < Math.max(.025, body.width * .55);
  });
  return matches.length === 1 ? matches[0] : null;
}
export function participantHands(hands, pose) {
  const body = descriptor(pose);
  if (!body) return [];
  const wrists = [15, 16].map(i => pose.landmarks[i]).filter(p => p && (p.visibility ?? 1) >= .5);
  return hands.filter(points => points?.[0] && wrists.some(wrist => distance(wrist, points[0]) < Math.max(.025, body.width * .4)));
}

// Pose supplies the search region only; FaceLandmarker must still detect a face.
export function participantHeadRegion(pose, width, height) {
  const body = descriptor(pose), nose = pose?.landmarks?.[0];
  if (!body || !nose || !Number.isFinite(nose.x) || !Number.isFinite(nose.y) || (nose.visibility ?? 1) < .35 || width <= 0 || height <= 0) return null;
  if (nose.x < 0 || nose.x > 1 || nose.y < 0 || nose.y > 1) return null;
  const ears = [7, 8].map(i => pose.landmarks[i]).filter(p => p && (p.visibility ?? 1) >= .5 && Number.isFinite(p.x));
  const earSpan = ears.length === 2 ? Math.abs(ears[0].x - ears[1].x) * width : 0;
  const size = Math.min(width, height, Math.max(48, body.width * width * 1.15, earSpan * 1.8));
  return { x: Math.max(0, Math.min(width - size, nose.x * width - size / 2)),
    y: Math.max(0, Math.min(height - size, nose.y * height - size * .55)), width: size, height: size };
}
export function drawParticipantHead(video, canvas, pose) {
  const region = participantHeadRegion(pose, video.videoWidth, video.videoHeight);
  if (!region) return null;
  canvas.width = canvas.height = 384;
  canvas.getContext('2d').drawImage(video, region.x, region.y, region.width, region.height, 0, 0, 384, 384);
  return region;
}
