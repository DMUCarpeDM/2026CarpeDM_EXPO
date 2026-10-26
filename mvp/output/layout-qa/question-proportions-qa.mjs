import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const stage=process.argv[2]||'after';
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
const prompt='저는 프론트엔드 개발자예요. 어제 결제 오류 수정이 추가되어 금요일 배포가 어려워졌어요. 다음 주 화요일로 마감 연장에 합의하고 싶어요. AI는 제 직속 개발팀장인 가상 인물 김지안이고, 출시 일정과 품질을 책임지며 차분하고 협력적인 성격에 존댓말을 써요. 난이도는 기본, 5턴으로 연습할게요.';
try {for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:667}]){
 const p=await browser.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5186/');await p.locator('#home-scenario-prompt').fill(prompt);await p.getByRole('button',{name:'입력한 상황으로 연습 준비하기'}).first().click();await p.getByRole('button',{name:'계속하기',exact:true}).click();await p.locator('.simulation-question-card').waitFor({timeout:90000});
 const metrics=await p.evaluate(()=>{const card=document.querySelector('.simulation-question-card'),composer=document.querySelector('.simulation-chat-input-area>form'),log=document.querySelector('.simulation-chat-transcript');const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return{card:box(card),composer:box(composer),transcript:box(log),cardRatio:card.getBoundingClientRect().height/innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}});
 assert.equal(metrics.overflow,false);assert(metrics.composer.y>=metrics.card.bottom);assert(metrics.composer.bottom<=viewport.height+1);
 await p.locator('#simulation-chat-input').fill('이번에는 추가 인력을 요청하는 방법도 연습하고 싶어요.');assert.equal(await p.locator('#simulation-chat-input').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await p.screenshot({path:`output/layout-qa/question-proportions-${stage}-${viewport.width}.png`});
 results.push({viewport,...metrics,errors});console.log(JSON.stringify(results.at(-1)));assert.deepEqual(errors,[]);await p.close();
}}finally{await browser.close();await writeFile(`output/layout-qa/question-proportions-${stage}.json`,JSON.stringify(results,null,2));}
