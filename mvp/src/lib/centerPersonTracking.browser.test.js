import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startVite} from './serviceEntryRouteHarness.js';

test('real MediaPipe reacquires edge people after empty frames and preserves distance crops', {timeout:120000}, async t=>{
 const root=fileURLToPath(new URL('../..',import.meta.url));
 const fixture=await mkdtemp(resolve(root,'.distance-tracking-'));
 t.after(()=>rm(fixture,{recursive:true,force:true}));
 await writeFile(resolve(fixture,'index.html'),`<video id="v" muted src="/src/features/smart-mirror/assets/welcome-vertex.mp4"></video><script type="module">
 import {PoseLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
 import {centralPose,smallPose,drawCenteredInput,mapRegionLandmarks,TRACKING_SCAN_CENTERS} from '/src/lib/centerPersonTracking.js';
 window.check=async()=>{
 const v=document.querySelector('video');await new Promise((ok,bad)=>{if(v.readyState>=2)ok();else{v.onloadeddata=ok;v.onerror=bad;}});
 v.currentTime=.4;await new Promise(ok=>v.onseeked=ok);
 const model=await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/mediapipe-wasm'),{baseOptions:{modelAssetPath:'/models/pose_landmarker_heavy.task'},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:.4,minPosePresenceConfidence:.4,minTrackingConfidence:.4});
 const rows=[],handoffs=[];let ts=1000;
 try{for(const size of [.85,.45,.3]){
 const input=document.createElement('canvas');input.width=1280;input.height=720;
 const h=720*size,w=h*v.videoWidth/v.videoHeight;
 const ctx=input.getContext('2d');ctx.fillStyle='#202020';ctx.fillRect(0,0,1280,720);ctx.drawImage(v,(1280-w)/2,(720-h)/2,w,h);
 const raw=model.detectForVideo(input,ts+=100);const original=centralPose(raw);let selected=original;
 const crop=document.createElement('canvas');const region=drawCenteredInput(input,crop);
 const cropped=centralPose(model.detectForVideo(crop,ts+=100));
 if(smallPose(original)&&cropped)selected={...cropped,landmarks:mapRegionLandmarks(cropped.landmarks,region,1280,720)};
 rows.push({size,rawCount:raw.landmarks.length,shoulders:raw.landmarks[0]?.slice(11,13),original:Boolean(original),cropped:Boolean(cropped),selected:Boolean(selected),shoulderWidth:selected?Math.abs(selected.landmarks[11].x-selected.landmarks[12].x):null});
 }
 for(const position of ['left','right','center']){
  const frame=document.createElement('canvas');frame.width=1280;frame.height=720;
  const context=frame.getContext('2d');context.fillStyle='#202020';context.fillRect(0,0,1280,720);
  let blank;
  for(let attempt=0;attempt<3;attempt++)blank=centralPose(model.detectForVideo(frame,ts+=100));
  const scale=Math.min(320/v.videoWidth,600/v.videoHeight),w=v.videoWidth*scale,h=v.videoHeight*scale;
  context.drawImage(v,position==='left'?8:position==='right'?1280-w-8:(1280-w)/2,(720-h)/2,w,h);
  let selected;
  for(let attempt=0;attempt<3;attempt++){
   selected=centralPose(model.detectForVideo(frame,ts+=100));
   if(smallPose(selected)){
    const crop=document.createElement('canvas');
    const centerX=selected?(selected.landmarks[11].x+selected.landmarks[12].x)/2:TRACKING_SCAN_CENTERS[attempt];
    const region=drawCenteredInput(frame,crop,centerX);
    const candidate=centralPose(model.detectForVideo(crop,ts+=100));
    if(candidate)selected={...candidate,landmarks:mapRegionLandmarks(candidate.landmarks,region,1280,720)};
   }
   if(selected)break;
  }
  handoffs.push({position,blank:Boolean(blank),selected:Boolean(selected),center:selected?(selected.landmarks[11].x+selected.landmarks[12].x)/2:null});
 }
 }finally{model.close();}return {rows,handoffs};};
 </script>`);
 const {server,url}=await startVite();t.after(()=>server.close());
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(url+basename(fixture)+'/index.html');
 await page.waitForFunction(()=>typeof window.check==='function');
 const {rows,handoffs}=await page.evaluate(()=>window.check());
 console.log('Distance fixture:',JSON.stringify(rows));
 assert.ok(rows.every(row=>row.selected));
 assert.ok(rows.filter(row=>row.size<=.45).every(row=>row.shoulderWidth>=.025&&row.shoulderWidth<.05));
 assert.ok(rows.filter(row=>row.selected).every(row=>row.shoulderWidth>0&&row.shoulderWidth<.4));
 console.log('Person exit and reacquisition:',JSON.stringify(handoffs));
 assert.ok(handoffs.every(row=>!row.blank&&row.selected));
 assert.ok(handoffs.find(row=>row.position==='left').center<.2);
 assert.ok(handoffs.find(row=>row.position==='right').center>.8);
});
