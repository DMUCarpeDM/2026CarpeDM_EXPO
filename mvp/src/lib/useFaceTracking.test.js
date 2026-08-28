import test from "node:test";
import assert from "node:assert/strict";

import { drawOverlay } from "./useFaceTracking.js";

const VIDEO = { videoWidth: 1280, videoHeight: 720 };

function makeCanvas() {
  const arcs = [];
  const ctx = {
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    quadraticCurveTo() {}, fill() {},
    arc(...args) { arcs.push(args); },
    set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {},
    set lineCap(_) {}, set shadowColor(_) {}, set shadowBlur(_) {},
  };
  return { canvas: { width: 640, height: 360, clientWidth: 640, clientHeight: 360, getContext: () => ctx }, arcs };
}

test("drawOverlay draws all 21 hand landmarks when a hand is tracked", () => {
  const { canvas, arcs } = makeCanvas();
  const hand = Array.from({ length: 21 }, (_, index) => ({ x: 0.2 + index * 0.01, y: 0.4 }));

  drawOverlay(canvas, VIDEO, undefined, undefined, [hand]);

  assert.equal(arcs.length, 21);
});

test("drawOverlay marks every connected upper-body Pose joint", () => {
  const { canvas, arcs } = makeCanvas();
  const pose = Array.from({ length: 25 }, () => undefined);
  for (const index of [11, 12, 13, 14, 23, 24]) pose[index] = { x: 0.3 + index * 0.01, y: 0.5, visibility: 1 };

  drawOverlay(canvas, VIDEO, undefined, pose);

  assert.equal(arcs.length, 6);
});
