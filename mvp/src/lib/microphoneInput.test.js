import test from 'node:test';
import assert from 'node:assert/strict';
import {microphoneConstraints,preferredUsbMicrophone,requestMicrophone,RAW_MIC_SETTINGS} from './microphoneInput.js';

const usb = {kind:'audioinput',deviceId:'usb-mic',label:'USBAudio 1.0 (3634:4155)'};
test('selects the designated USB microphone before other audio inputs',()=>{
  assert.equal(preferredUsbMicrophone([
    {kind:'audioinput',deviceId:'default',label:usb.label},
    {kind:'videoinput',deviceId:'camera',label:usb.label},
    {kind:'audioinput',deviceId:'other-usb',label:'USBAudio 1.0'}, usb,
  ]),usb);
  assert.deepEqual(microphoneConstraints(usb),{...RAW_MIC_SETTINGS,deviceId:{exact:'usb-mic'}});
});
test('uses the OS default when the designated USB is absent',async()=>{
  const preferred = preferredUsbMicrophone([{kind:'audioinput',deviceId:'laptop',label:'Built-in Microphone'}]);
  let capture;
  await requestMicrophone({getUserMedia:async c=>{capture=c;return 'default-stream';}},preferred);
  assert.deepEqual(capture,{audio:RAW_MIC_SETTINGS});
});
test('keeps a working USB without also opening the default microphone',async()=>{
  const calls=[];
  const stream=await requestMicrophone({getUserMedia:async c=>{calls.push(c);return 'usb-stream';}},usb);
  assert.equal(stream,'usb-stream');
  assert.equal(calls.length,1);
});
for(const name of ['NotFoundError','NotReadableError','OverconstrainedError','AbortError','TimeoutError']){
  test(`falls back to the OS default after USB ${name}`,async()=>{
    const calls=[];
    const stream=await requestMicrophone({getUserMedia:async c=>{
      calls.push(c);
      if(c.audio.deviceId) throw new DOMException('USB unavailable',name);
      return 'default-stream';
    }},usb);
    assert.equal(stream,'default-stream');
    assert.deepEqual(calls,[{audio:microphoneConstraints(usb)},{audio:RAW_MIC_SETTINGS}]);
  });
}
test('does not retry a denied microphone permission on another device',async()=>{
  let calls=0;
  await assert.rejects(requestMicrophone({getUserMedia:async()=>{calls++;throw new DOMException('denied','NotAllowedError');}},usb),{name:'NotAllowedError'});
  assert.equal(calls,1);
});
test('returns the default microphone error when both inputs fail',async()=>{
  let calls=0;
  await assert.rejects(requestMicrophone({getUserMedia:async()=>{calls++;throw new DOMException('missing','NotFoundError');}},usb),{name:'NotFoundError'});
  assert.equal(calls,2);
});
