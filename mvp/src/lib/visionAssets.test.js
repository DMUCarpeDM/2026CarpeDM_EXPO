import test from "node:test";
import assert from "node:assert/strict";
import {resolveModel, resolveWasmUrl, MODELS, CDN_WASM, LOCAL_WASM} from "./visionAssets.js";

test("HTML fallback with HTTP 200 is not a local vision asset", async t => {
  t.mock.method(globalThis,"fetch",async()=>new Response("",{headers:{"content-type":"text/html"}}));
  assert.equal(await resolveModel("face"),MODELS.face.cdn);
  assert.equal(await resolveWasmUrl(),CDN_WASM);
});
test("real local vision assets are preferred", async t => {
  t.mock.method(globalThis,"fetch",async()=>new Response("",{headers:{"content-type":"application/octet-stream"}}));
  assert.equal(await resolveModel("face"),MODELS.face.local);
  assert.equal(await resolveWasmUrl(),LOCAL_WASM);
});
