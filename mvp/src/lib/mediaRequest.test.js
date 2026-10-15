import test from 'node:test';
import assert from 'node:assert/strict';
import {enumerateCaptureDevices, requestCapture} from './mediaRequest.js';

test('a hanging device enumeration does not prevent capture', async () => {
  assert.deepEqual(await enumerateCaptureDevices({enumerateDevices:()=>new Promise(()=>{})}, 5), []);
});
test('late capture is stopped after timeout', async () => {
  let resolve, stopped = 0;
  const pending = new Promise(r=>{resolve=r;});
  await assert.rejects(requestCapture({getUserMedia:()=>pending}, {video:true}, 5), {name:'TimeoutError'});
  resolve({getTracks:()=>[{stop:()=>stopped++}]});
  await new Promise(r=>setTimeout(r,0));
  assert.equal(stopped,1);
});
test('successful capture keeps its tracks alive', async () => {
  const stream = {getTracks:()=>[{stop:()=>assert.fail('working track stopped')}]};
  assert.equal(await requestCapture({getUserMedia:async()=>stream},{audio:true},5),stream);
});
