import test from 'node:test';
import assert from 'node:assert/strict';
import { detectParticipantFace } from './participantFaceDetection.js';
import { participantHeadRegion } from './participantTracking.js';

const video = { videoWidth: 1920, videoHeight: 1080 };
function pose() {
  const landmarks = Array.from({length:33}, () => ({x:.5,y:.4,visibility:.9}));
  landmarks[0] = {x:.5,y:.25,visibility:.9};
  landmarks[11].x = .47; landmarks[12].x = .53;
  return {landmarks};
}
function canvas() {
  return {getContext:()=>({drawImage(){}})};
}
test('enlarges a distant selected head and returns original video coordinates', () => {
  const person = pose(), input = canvas(), calls = [];
  const region = participantHeadRegion(person,1920,1080);
  const detector = {detectForVideo(source,ts) {
    calls.push([source,ts]); return {faceLandmarks:[[{x:.45,y:.5},{x:.55,y:.6}]]};
  }};
  const points = detectParticipantFace(detector,video,input,person,100);
  assert.equal(calls.length,1); assert.equal(calls[0][0],input);
  assert.equal(input.width,384);
  assert.ok(region.width < 1920*.1);
  assert.equal(points[0].x,(region.x+.45*region.width)/1920);
  assert.equal(points[0].y,(region.y+.5*region.height)/1080);
});
test('falls back to full video and rejects an unrelated bystander', () => {
  const calls=[];
  const detector={detectForVideo(source,ts){calls.push(ts);
    return {faceLandmarks: source===video ? [[{x:.8,y:.2},{x:.85,y:.3}]] : []};
  }};
  assert.equal(detectParticipantFace(detector,video,canvas(),pose(),100),null);
  assert.equal(calls.length,2); assert.ok(calls[1]>calls[0]);
});
test('does not run face inference without a selected participant', () => {
  assert.equal(detectParticipantFace({detectForVideo(){assert.fail();}},video,canvas(),null,100),null);
});
test('keeps a locked distant participant with a weaker nose but rejects hidden noses', () => {
  const person=pose(); person.landmarks[0].visibility=.4;
  assert.ok(participantHeadRegion(person,1920,1080));
  person.landmarks[0].visibility=.1;
  assert.equal(participantHeadRegion(person,1920,1080),null);
});
