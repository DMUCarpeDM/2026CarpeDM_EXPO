import {test} from "node:test";
import assert from "node:assert/strict";
import {faceCrop, normalizeFace, addExpressionSample, expressionMetrics, EXPRESSION_LABELS} from "./expressionModel.js";
import {makeTurnAcc, finalizeTurnMetrics} from "./nonverbalMetrics.js";

test("face crop rejects missing, tiny and clipped faces", () => {
  assert.equal(faceCrop(null, 1000, 1000), null);
  assert.equal(faceCrop([{x:0,y:0}, {x:.2,y:.2}],1000,1000), null);
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
