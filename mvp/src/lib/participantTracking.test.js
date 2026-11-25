import test from 'node:test';
import assert from 'node:assert/strict';
import {createParticipantTracker, participantFace, participantHands, participantHeadRegion} from './participantTracking.js';
const pose=(x=.5,width=.15)=>({landmarks:Array.from({length:33},(_,i)=>({x:i===11?x-width/2:i===12?x+width/2:x,y:i===0?.2:i===15||i===16?.7:.4,visibility:.9})),worldLandmarks:[x]});
function acquire(tracker,p,start=0){for(let t=start;t<=start+1000;t+=100)tracker.update([p],t);}
test('requires a stable central participant for one second',()=>{const t=createParticipantTracker(),p=pose();assert.equal(t.update([p],0),null);assert.equal(t.update([p],900),null);acquire(t,p,1000);assert.equal(t.current,p);});
test('keeps selected participant when detection order changes or a bystander becomes central',()=>{const t=createParticipantTracker(),p=pose(.56);acquire(t,p);const other=pose(.43);assert.equal(t.update([other,p],1100),p);assert.equal(t.update([p,other],1200),p);});
test('does not instantly transfer to bystander when selected participant disappears',()=>{const t=createParticipantTracker(),p=pose();acquire(t,p);const other=pose(.68);assert.equal(t.update([other],1100),null);assert.equal(t.update([other],2900),null);const back=pose(.51);assert.equal(t.update([back],2950),null);for(let n=3050;n<=3250;n+=100)t.update([back],n);assert.equal(t.current,back);});
test('ambiguous crossing withholds tracking and samples',()=>{const t=createParticipantTracker();acquire(t,pose());assert.equal(t.update([pose(.49),pose(.51)],1100),null);assert.equal(t.current,null);acquire(t,pose(),1200);assert.ok(t.current);});
test('retains target across long occlusion and automatically reconnects without central reselection',()=>{const t=createParticipantTracker(),p=pose(.56);acquire(t,p);const g=t.generation;for(let n=3100;n<5100;n+=100)assert.equal(t.update([pose(.35)],n),null);for(let n=5200;n<=5500;n+=100)t.update([p],n);assert.equal(t.current,p);assert.equal(t.generation,g);});
test('face and hand association reject other people and missing target',()=>{const p=pose(),own=[{x:.48,y:.18},{x:.52,y:.22}],other=[{x:.73,y:.18},{x:.77,y:.22}];assert.equal(participantFace([other,own],p),own);assert.equal(participantFace([other],p),null);assert.equal(participantFace([own,own],p),null);assert.equal(participantFace([own],null),null);const hand=[{x:.5,y:.7}],foreign=[{x:.8,y:.7}];assert.deepEqual(participantHands([foreign,hand],p),[hand]);assert.deepEqual(participantHands([hand],null),[]);});
test('rejects frame gaps during acquisition and resets on new camera session',()=>{const t=createParticipantTracker(),p=pose();t.update([p],0);assert.equal(t.update([p],1000),null);acquire(t,p,1100);t.reset();assert.equal(t.current,null);assert.equal(t.update([p],2200),null);});

test('head region follows selected nose, stays inside image and rejects missing target',()=>{
 const region=participantHeadRegion(pose(.5),1080,1920);
 assert.ok(region.y < .2*1920 && region.y+region.height > .2*1920);
 assert.equal(region.width,region.height);
 const edge=participantHeadRegion(pose(.02),1080,1920);assert.equal(edge.x,0);
 assert.equal(participantHeadRegion(null,1080,1920),null);
 const hidden=pose();hidden.landmarks[0].visibility=.1;assert.equal(participantHeadRegion(hidden,1080,1920),null);
});
