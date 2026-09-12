import { chromium } from 'playwright';
import { test } from 'node:test';
import { startVite } from './serviceEntryRouteHarness.js';

test('practice shows one tip, pauses observation and finishes the session', {timeout: 45000}, async (t) => {
const {server, url} = await startVite();
t.after(() => server.close());
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
t.after(() => browser.close());
const context = await browser.newContext({viewport:{width:1440,height:1100},permissions:['camera','microphone']});
const page = await context.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 localStorage.setItem('mirror-ting-active-session',JSON.stringify({id:21,access_token:'test-token'}));
 window.SpeechRecognition = class {
  start(){this.onstart?.(); this.timer=setInterval(()=>{const r=[{transcript:'답변을 이어 말하고 있습니다'}];r.isFinal=false;this.onresult?.({resultIndex:0,results:[r]});},1000);}
  stop(){clearInterval(this.timer);this.onend?.();}
 };
 Object.defineProperty(window.speechSynthesis,'speak',{value:u=>setTimeout(()=>u.onend?.(),10)});
});
const scenario={slug:'training',title:'대화 연습',characters:[{id:'c',name:'면접관',role:'면접관'}],episodes:[{id:1,title:'질문',character_id:'c',modes:[5]}]};
const turn={id:31,order:1,question_text:'지원을 결정한 이유를 말씀해 주세요.',question_type:'main',character_id:'c',episode_id:1};
let observations=0, finishes=0;
await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 let value={};
 if(path.endsWith('/health'))value={dialogue_ready:true,tts_ready:false};
 else if(path.endsWith('/scenarios'))value=[scenario];
 else if(path.endsWith('/sessions/21'))value={id:21,status:'in_progress',mode:5,difficulty:'basic',scenario,current_turn:turn,history:[],elapsed_sec:0,interaction:{mode:'interview',index:0,total:6}};
 else if(path.endsWith('/observation')){observations++;if(route.request().headers()['x-session-token']!=='test-token')throw new Error('missing session token'); value={turn_id:31,tip:{id:'j31',message:'고개를 조금 들어 상대를 바라보세요.',rule:'head_down'}};}
 else if(path.endsWith('/finish')){finishes++; value={status:'analyzing',stage:'queued',pct:0};}
 else if(path.endsWith('/progress'))value={status:'analyzing',stage:'response',pct:25};
 else if(path.endsWith('/history'))value={items:[]};
 await route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
});
await page.goto(url);
await page.locator('.practice-screen').waitFor({timeout:10000});
await page.locator('.practice-live-tip').waitFor({timeout:20000});

await page.getByRole('button',{name:'일시정지',exact:true}).click();
await page.locator('.practice-live-tip').waitFor({state:'hidden'});
const before=observations; await page.waitForTimeout(5500); if(observations!==before)throw new Error('polling during pause');
await page.getByRole('button',{name:'연습 종료',exact:true}).click();
await page.getByRole('dialog',{name:'연습 종료 확인'}).getByRole('button',{name:'종료',exact:true}).click();
await page.waitForTimeout(500);
if(finishes!==1)throw new Error(`finish requests ${finishes}`);

await browser.close();
if(errors.length)throw new Error(errors.join('\n'));
});
