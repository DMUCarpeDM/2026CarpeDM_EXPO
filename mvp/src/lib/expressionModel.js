// The handoff specifies multi-label sigmoid outputs, not a single emotion class.
export const EXPRESSION_LABELS = ["smile", "brow_furrow", "brow_raise", "eyes_wide", "eyes_closed", "mouth_wide_open", "neutral"];
export const EXPRESSION_VERSION = "expression-resnet18-v1";
export const EXPRESSION_PREPROCESSING = "imagenet-face-square-provisional-v1";
const MEAN = [.485, .456, .406];
const STD = [.229, .224, .225];

export function faceCrop(landmarks, width, height) {
  if (!landmarks?.length || !width || !height) return null;
  const points = landmarks.slice(0, 468);
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const xs = points.map(p => p.x * width), ys = points.map(p => p.y * height);
  const left = Math.min(...xs), top = Math.min(...ys);
  const w = Math.max(...xs) - left, h = Math.max(...ys) - top;
  if (w < 32 || h < 32) return null;
  // Reject genuinely clipped faces, but keep fully visible faces whose padding crosses an edge.
  if (left <= 0 || top <= 0 || left + w >= width || top + h >= height) return null;
  const size = Math.min(Math.max(w, h) * 1.2, width, height);
  if (size < Math.max(w, h)) return null;
  const x = Math.max(0, Math.min(width - size, left + w / 2 - size / 2));
  const y = Math.max(0, Math.min(height - size, top + h / 2 - size / 2));
  return {x, y, size};
}

export function normalizeFace(rgba) {
  if (rgba.length !== 224 * 224 * 4) throw new Error("Expected 224x224 RGBA face");
  const tensor = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) {
    for (let c = 0; c < 3; c++) tensor[c * 224 * 224 + i] = (rgba[4 * i + c] / 255 - MEAN[c]) / STD[c];
  }
  return tensor;
}

export function addExpressionSample(acc, logits, now = performance.now()) {
  if (logits.length !== 7 || !Array.from(logits).every(Number.isFinite)) throw new Error("Invalid expression outputs");
  acc.expression ??= {samples: 0, sums: Array(7).fill(0)};
  const smiling = 1 / (1 + Math.exp(-logits[0])) >= .85;
  const previous = acc.expression.lastSampleAt;
  if (!smiling) acc.expression.smileSince = null;
  else if (acc.expression.smileSince == null || previous == null || now - previous > 2000) acc.expression.smileSince = now;
  acc.expression.maxSmileMs = Math.max(acc.expression.maxSmileMs || 0, smiling && acc.expression.smileSince != null ? now - acc.expression.smileSince : 0);
  acc.expression.lastSampleAt = now;
  acc.expression.samples++;
  for (let i = 0; i < 7; i++) acc.expression.sums[i] += 1 / (1 + Math.exp(-logits[i]));
}

export function expressionMetrics(acc) {
  if (!acc.expression?.samples) return null;
  return {version: EXPRESSION_VERSION, status: "unvalidated", preprocessing: EXPRESSION_PREPROCESSING,
    sustained_smile_ms: Math.min(60000, acc.expression.maxSmileMs || 0),
    samples: acc.expression.samples,
    mean_outputs: Object.fromEntries(EXPRESSION_LABELS.map((key, i) => [key, acc.expression.sums[i] / acc.expression.samples]))};
}
