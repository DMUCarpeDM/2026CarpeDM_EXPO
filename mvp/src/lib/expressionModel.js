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
  const size = Math.max(w, h) * 1.2;
  const x = left + w / 2 - size / 2, y = top + h / 2 - size / 2;
  // Do not invent a face from partial/off-screen geometry.
  if (x < 0 || y < 0 || x + size > width || y + size > height) return null;
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

export function addExpressionSample(acc, logits) {
  if (logits.length !== 7 || !Array.from(logits).every(Number.isFinite)) throw new Error("Invalid expression outputs");
  acc.expression ??= {samples: 0, sums: Array(7).fill(0)};
  acc.expression.samples++;
  for (let i = 0; i < 7; i++) acc.expression.sums[i] += 1 / (1 + Math.exp(-logits[i]));
}

export function expressionMetrics(acc) {
  if (!acc.expression?.samples) return null;
  return {version: EXPRESSION_VERSION, status: "unvalidated", preprocessing: EXPRESSION_PREPROCESSING,
    samples: acc.expression.samples,
    mean_outputs: Object.fromEntries(EXPRESSION_LABELS.map((key, i) => [key, acc.expression.sums[i] / acc.expression.samples]))};
}
