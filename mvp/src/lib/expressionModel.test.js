import {test} from "node:test";
import assert from "node:assert/strict";
import {faceCrop, normalizeFace, addExpressionSample, expressionMetrics, EXPRESSION_LABELS} from "./expressionModel.js";
import {makeTurnAcc, finalizeTurnMetrics} from "./nonverbalMetrics.js";

test("face crop rejects missing, tiny and clipped faces", () => {
  assert.equal(faceCrop(null, 1000, 1000), null);
  assert.equal(faceCrop([{x:-.1,y:0}, {x:.2,y:.2}],1000,1000), null);
  assert.equal(faceCrop([{x:.5,y:.5}, {x:.51,y:.51}],1000,1000), null);
  assert.deepEqual(faceCrop([{x:.3,y:.3}, {x:.7,y:.7}],1000,1000), {x:260,y:260,size:480});
});
test("RGB input uses channel-first ImageNet provisional normalization", () => {
  const rgba = new Uint8ClampedArray(224 * 224 * 4); rgba[0]=255;
  const input = normalizeFace(rgba);
  assert.ok(Math.abs(input[0] - (1-.485)/.229)<1e-5);
  assert.ok(Math.abs(input[224*224] - (-.456)/.224)<1e-5);
});
test("sigmoid allows simultaneous outputs; no face samples means no result", () => {
  const acc=makeTurnAcc();
  assert.equal(expressionMetrics(acc),null);
  addExpressionSample(acc,[0,0,0,0,0,0,0]);
  addExpressionSample(acc,[0,0,0,0,0,0,0]);
  const m=finalizeTurnMetrics(acc);
  assert.equal(m.expression_model.samples,2);
  assert.deepEqual(m.expression_model.mean_outputs,Object.fromEntries(EXPRESSION_LABELS.map(k=>[k,.5])));
  assert.equal(m.expression_model.status,"unvalidated");
  assert.equal("score" in m.expression_model,false);
  assert.throws(()=>addExpressionSample(acc,[NaN,0,0,0,0,0,0]));
  assert.equal(expressionMetrics(makeTurnAcc()),null);
});

test('sustained smile needs contiguous high-output samples; gaps and low samples break the streak', () => {
  const high=[3,0,0,0,0,0,0], low=[0,0,0,0,0,0,0];
  const acc=makeTurnAcc();
  for(const t of [0,1000,2000]) addExpressionSample(acc,high,t);
  assert.equal(expressionMetrics(acc).sustained_smile_ms,2000);
  addExpressionSample(acc,low,3000);
  addExpressionSample(acc,high,4000);
  addExpressionSample(acc,high,7000);
  assert.equal(expressionMetrics(acc).sustained_smile_ms,2000);
  for(const t of [8000,9000,10000]) addExpressionSample(acc,high,t);
  assert.equal(expressionMetrics(acc).sustained_smile_ms,3000);
});


test("fully visible edge faces survive padding and retain expression payload without pose", () => {
  assert.deepEqual(faceCrop([{x:.01,y:.2},{x:.21,y:.4}],1000,1000), {x:0,y:180,size:240});
  const acc=makeTurnAcc();
  for(let i=0;i<4;i++) addExpressionSample(acc,[0,0,0,0,0,0,0],i*1000);
  const payload=JSON.parse(JSON.stringify(finalizeTurnMetrics(acc)));
  assert.equal(payload.expression_model.samples,4);
  assert.equal(payload.frames,0);
});

test("a complete face near the image edge keeps its sample when only padding overflows", () => {
  const crop=faceCrop([{x:.01,y:.2},{x:.3,y:.6}],640,480);
  assert.ok(crop);
  assert.equal(crop.x,0);
  assert.ok(crop.y>=0 && crop.x+crop.size<=640 && crop.y+crop.size<=480);
});
