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

test('face selection follows central visitor but rejects ambiguous central faces',async()=>{
 const {centralFace}=await import('./centerPersonTracking.js');
 const center=[{x:.48},{x:.52}],side=[{x:.7},{x:.8}];
 assert.equal(centralFace([side,center]),center);
 assert.equal(centralFace([center,[{x:.49},{x:.55}]]),null);
});
