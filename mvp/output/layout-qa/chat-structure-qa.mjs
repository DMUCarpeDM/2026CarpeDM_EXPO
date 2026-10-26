import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true});
const draft={job_role:'개발자',situation:'일정 조율',context:'검증 시간이 필요해요',goal:'우선순위 합의',turns:2,target:'팀장',difficulty:'basic',personality:'차분함',persona:'업무 일정을 조율하는 팀장'};
try {for(const viewport of [{width:1440,height:1000},{width:768,height:1000},{width:390,height:844},{width:320,height:667}]){
 const p=await b.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(e.message));let prepares=0,replies=0;
 await p.route('**/api/simulation-chat/prepare',r=>{prepares++;return r.fulfill({json:prepares===1?{message:'함께 연습할 상황을 살펴봤어요.\n'.repeat(18),draft:{...draft,goal:''},question:{field:'goal',title:'어떤 목표로 연습할까요?',choices:['우선순위 합의하기','일정 변경 요청하기']}}:{message:'설정을 모두 확인했어요. 준비가 끝났어요.',draft,question:null}})});
 await p.route('**/api/simulation-chat/reply',async r=>{replies++;const payload=r.request().postDataJSON();if(replies===2)assert.equal(payload.messages.at(-1).content,'먼저 완료할 범위를 정하고 싶습니다.');return r.fulfill({json:{message:replies===1?'이번 주에 먼저 끝낼 수 있는 일은 무엇인가요?':'좋아요. 그 범위부터 정리해봅시다.',answered_turns:replies-1,done:replies>=3}})});
 await p.goto('http://127.0.0.1:5186/');await p.locator('#home-scenario-prompt').fill('팀장과 일정 조율하기');await p.getByRole('button',{name:'입력한 상황으로 연습 준비하기'}).first().click();await p.getByRole('button',{name:'계속하기',exact:true}).click();await p.locator('.simulation-question').waitFor();
 assert.equal(await p.locator('.simulation-chat-transcript .simulation-question').count(),1);
 assert(await p.locator('.simulation-chat-input-area').evaluate(e=>Math.abs(e.getBoundingClientRect().bottom-innerHeight)<2));
 assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false);
 const context=p.locator('#simulation-context');
 if(viewport.width>800){assert(await context.isVisible());const box=await p.locator('.simulation-chat-input-area').boundingBox();assert.equal(box.width,768);assert(Math.abs(box.x+box.width/2-(viewport.width-288)/2)<1);await p.getByRole('button',{name:'연습 설정 닫기',exact:true}).click();assert.equal(await context.isVisible(),false);const centered=await p.locator('.simulation-chat-input-area').boundingBox();assert(Math.abs(centered.x+centered.width/2-viewport.width/2)<1);}
 else assert.equal(await context.isVisible(),false);
 await p.locator('#simulation-chat-input').fill('작성 중인 답변');
 await p.getByRole('button',{name:'연습 설정 열기',exact:true}).click();assert(await context.isVisible());await p.screenshot({path:`output/layout-qa/chat-context-${viewport.width}.png`});await p.getByRole('button',{name:'설정 닫기',exact:true}).click();assert.equal(await p.locator('#simulation-chat-input').inputValue(),'작성 중인 답변');assert.equal(await context.isVisible(),false);
 await p.getByRole('button',{name:/우선순위 합의하기/}).click();assert.equal(await p.locator('#simulation-chat-input').inputValue(),'우선순위 합의하기');await p.getByRole('button',{name:'준비 답변 보내기',exact:true}).click();await p.getByRole('button',{name:'설정 확정하고 시작하기',exact:true}).waitFor();
 await p.screenshot({path:`output/layout-qa/chat-ready-${viewport.width}.png`});
 await p.getByRole('button',{name:'설정 확정하고 시작하기',exact:true}).click();await p.getByRole('log').getByText('이번 주에 먼저 끝낼 수 있는 일은 무엇인가요?').waitFor();await p.locator('#simulation-chat-input').fill('먼저 완료할 범위를 정하고 싶습니다.');await p.getByRole('button',{name:'시뮬레이션 답변 보내기',exact:true}).click();await p.getByRole('log').getByText('좋아요. 그 범위부터 정리해봅시다.').waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:`output/layout-qa/chat-after-${viewport.width}.png`});assert.equal(await p.getByRole('button',{name:'연습 종료하기',exact:true}).count(),0);await p.locator('#simulation-chat-input').fill('우선순위를 정했습니다.');await p.getByRole('button',{name:'시뮬레이션 답변 보내기',exact:true}).click();await p.getByRole('log').getByText(/정한 2턴을 마쳤어요/).waitFor();assert.deepEqual(errors,[]);await p.getByRole('button',{name:'연습 공간으로 돌아가기',exact:true}).click();await p.locator('#home-scenario-prompt').waitFor();console.log(viewport,'768px central chat, context toggle preserves input, fixed composer, question/ready/start/reply/end/back PASS');await p.close();
 }}finally{await b.close()}
