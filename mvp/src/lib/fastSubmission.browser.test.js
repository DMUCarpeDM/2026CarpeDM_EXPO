import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startVite} from './serviceEntryRouteHarness.js';

test('recognition final dispatches text within one second and TTS precedes analysis upload', {timeout:45000}, async t=>{
 const root=fileURLToPath(new URL('../..',import.meta.url));
 const folder=await mkdtemp(resolve(root,'.fast-submission-'));t.after(()=>{
  assert.equal(dirname(resolve(folder)),resolve(root));
  assert.ok(basename(folder).startsWith('.fast-submission-'));
  return rm(folder,{recursive:true,force:true});
 });
 await writeFile(resolve(folder,'index.html'),`<div id="root"></div><script type="module">
 import React,{useRef,useState,useEffect} from 'react';import{createRoot}from'react-dom/client';
 import{usePracticeTranscription}from'/src/lib/usePracticeTranscription.js';
 import{submitResponse,releaseDeferredAudio,finishSession}from'/src/lib/pocApi.js';
 import{startTurnSpeech}from'/src/lib/turnSpeechPlayback.js';
 class Recognition{constructor(){window.rec=this;}start(){this.onstart?.();}abort(){}}
 window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=Recognition;
 window.Audio=class{async play(){this.onplay?.();this.onplaying?.();}pause(){}};
 window.events=[];const nativeFetch=window.fetch;
 window.fetch=(url,...args)=>{window.events.push({event:String(url).split('/').at(-1),at:performance.now()});return nativeFetch(url,...args);};
 const stream={},turn={id:1},session={id:81,access_token:'fixture',interaction:{mode:'workplace_continuous'},voice_analysis:{engine_version:'voice-measure-v2'}};
 function App(){const[draft,setDraft]=useState('');const active=useRef(false);useEffect(()=>{if(draft)window.inputAt=performance.now();},[draft]);
 usePracticeTranscription({setDraft,mediaStream:stream,turn,busy:false,paused:false,aiSpeaking:false,aiSpeechActiveRef:active,entryOverlayOpen:false,pushFeed:()=>{},onAutoSubmit:async()=>{
 const audioReady=new Promise(ok=>{window.converted=()=>ok(new Blob(['wav']));});
 await submitResponse(session,1,{text:draft,audioReady});
 window.stopSpeech=startTurnSpeech({text:'다음 질문입니다.',serverTtsReady:true,allowBrowserFallback:false,expectedServerProvider:'elevenlabs',onSpeakingChange:()=>{},onNote:()=>{},onFinish:()=>releaseDeferredAudio(session),onProgress:p=>{if(p.status==='playing'){window.events.push({event:'playing',at:performance.now()});releaseDeferredAudio(session);}}});
 }});return React.createElement('p',null,draft);}
 createRoot(document.querySelector('#root')).render(React.createElement(App));
 window.final=()=>{window.finalAt=performance.now();window.rec.onresult({resultIndex:0,results:[{0:{transcript:'개인적인 내용은 공개하지 않겠습니다.'},isFinal:true}]});};
 window.cleanup=async()=>{window.stopSpeech?.();await finishSession(session);};
 </script>`);
 const {server,url}=await startVite();t.after(()=>server.close());
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  return route.fulfill(path.endsWith('/tts')?{contentType:'audio/wav',headers:{'X-TTS-Provider':'elevenlabs'},body:'fixture wav'}:{contentType:'application/json',body:JSON.stringify({next_turn:{id:2}})});});
 await page.goto(url+basename(folder)+'/index.html');await page.waitForFunction(()=>window.rec?.onresult);
 await page.evaluate(()=>window.rec.onresult({resultIndex:0,results:[{0:{transcript:'아직 말하는 중'},isFinal:false}]}));
 await page.waitForTimeout(350);
 await page.evaluate(()=>window.rec.onresult({resultIndex:0,results:[{0:{transcript:'추가로 말씀드리면'},isFinal:false}]}));
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.events.length),0);
 await page.evaluate(()=>window.final());
 await page.waitForFunction(()=>window.events.some(e=>e.event==='playing'));
 const result=await page.evaluate(()=>({input:window.inputAt-window.finalAt,submit:window.events.find(e=>e.event==='response').at-window.finalAt,events:window.events.map(e=>e.event)}));
 console.log('Final-to-input/submit ms:',JSON.stringify(result));
 assert.ok(result.submit<1000);assert.ok(result.input<1000);
 assert.deepEqual(result.events,['response','tts','playing']);
 await page.evaluate(()=>window.converted());await page.waitForFunction(()=>window.events.some(e=>e.event==='audio'));
 const events=await page.evaluate(()=>window.events.map(e=>e.event));assert.deepEqual(events,['response','tts','playing','audio']);
 await page.evaluate(()=>window.cleanup());
});
