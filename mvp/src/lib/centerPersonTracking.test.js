import test from 'node:test';
import assert from 'node:assert/strict';
import {centeredRegion, mapRegionLandmarks, centralPose, smallPose} from './centerPersonTracking.js';
const body=(x,width=.04,visibility=.9)=>Array.from({length:33},(_,i)=>({x:i===11?x-width/2:i===12?x+width/2:x,y:.5,z:0,visibility}));
test('selects central person and matching world landmarks rather than first detection',()=>{
 const result=centralPose({landmarks:[body(.2),body(.5)],worldLandmarks:[['side'],['center']]});
 assert.equal(result.landmarks[0].x,.5);assert.deepEqual(result.worldLandmarks,['center']);
});
test('small or absent central pose requests crop, low confidence is not accepted',()=>{
 assert.equal(smallPose(null),true);assert.equal(smallPose(centralPose({landmarks:[body(.5)]})),true);
 assert.equal(smallPose(centralPose({landmarks:[body(.5,.2)]})),false);
 assert.equal(centralPose({landmarks:[body(.5,.2,.1)]}),null);
});
test('crop coordinates return to original image without changing confidence',()=>{
 const region=centeredRegion(1920,1080);
 const [p]=mapRegionLandmarks([{x:0,y:1,z:.2,visibility:.9}],region,1920,1080);
 assert.equal(p.x,.175);assert.equal(p.y,.825);assert.equal(p.z,.13);assert.equal(p.visibility,.9);
});

test('face selection prefers the center and remains active with multiple or edge faces',async()=>{
 const {centralFace}=await import('./centerPersonTracking.js');
 const center=[{x:.48},{x:.52}],side=[{x:.7},{x:.8}];
 assert.equal(centralFace([side,center]),center);
 assert.equal(centralFace([center,[{x:.49},{x:.55}]]),center);
 const edge=[{x:.02},{x:.12}];
 assert.equal(centralFace([edge]),edge);
});

test('reacquires a visible person on either edge after the prior person leaves',()=>{
 assert.ok(centralPose({landmarks:[body(.5)]}));
 assert.equal(centralPose({landmarks:[]}),null);
 for(const x of [.08,.92]){
  const result=centralPose({landmarks:[body(x,.1)],worldLandmarks:[[x]]});
  assert.equal(result.landmarks[0].x,x);
  assert.deepEqual(result.worldLandmarks,[x]);
 }
});

test('edge search crops stay inside the full camera frame and preserve mapping',()=>{
 for(const center of [.08,.92]){
  const region=centeredRegion(1920,1080,center);
  assert.ok(region.x>=0&&region.x+region.width<=1920);
  const point={x:(center*1920-region.x)/region.width,y:.5};
  assert.ok(Math.abs(mapRegionLandmarks([point],region,1920,1080)[0].x-center)<1e-10);
 }
});
