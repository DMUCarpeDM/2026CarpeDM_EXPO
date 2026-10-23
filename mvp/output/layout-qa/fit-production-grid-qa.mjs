import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [390,1440]) {
  const p=await b.newPage({viewport:{width,height:900}});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:5186/');
  await p.locator('.fit-grid-pattern').waitFor({state:'attached'});
  assert.equal(await p.locator('.fit-scroll-visual img').count(),4);
  const states=[];
  for(let index=0;index<5;index++) {
   await p.locator('.fit-scroll').evaluate((e,index)=>{const stage=e.firstElementChild;const inset=parseFloat(getComputedStyle(stage).top);scrollTo(0,e.getBoundingClientRect().top+scrollY-inset+(e.offsetHeight-stage.offsetHeight)*(index+.2)/5);},index);
   await p.waitForTimeout(300);
   states.push(await p.locator('.fit-scroll').getAttribute('data-active-fit'));
  }
  assert.deepEqual(states,['-1','0','1','2','3']);
  assert.equal(await p.getByRole('button',{name:/배경 (정지|재생)/}).count(),0);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.locator('.fit-scroll').evaluate(e=>{const s=e.firstElementChild;scrollTo(0,e.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(s).top)+(e.offsetHeight-s.offsetHeight)*.24);});
  await p.waitForTimeout(400);
  await p.screenshot({path:`output/layout-qa/fit-production-grid-${width}.png`});
  assert.deepEqual(errors,[]);
  console.log(width, 'PASS: original icons, 5 scroll phases, background button removed, no overflow/errors');
  await p.close();
 }
 const p=await b.newPage({reducedMotion:'reduce'});
 await p.goto('http://127.0.0.1:5186/');await p.locator('.fit-grid-pattern').waitFor({state:'attached'});
 assert(await p.locator('.fit-scroll-panel').evaluateAll(es=>es.every(e=>getComputedStyle(e).opacity==='1')));
 assert.equal(await p.locator('.fit-grid-toggle').count(),0);
 console.log('reduced motion PASS');
}finally{await b.close()}
