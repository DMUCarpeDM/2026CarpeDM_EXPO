import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startVite } from './serviceEntryRouteHarness.js';
test('mirror fills viewport with black even when backend is unavailable', { timeout: 45000 }, async t => {
  const {server,url}=await startVite();
  const browser=await chromium.launch({channel:'chrome',headless:true});
  t.after(async()=>{await browser.close();await server.close();});
  const page=await browser.newPage();
  await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.goto(url+'?mirror=1&service=workplace&idle=0');
  await page.locator('.mirror-welcome').waitFor();
  for(const size of [{width:730,height:1000},{width:1920,height:1080},{width:1080,height:1920}]){
    await page.setViewportSize(size);
    const actual=await page.evaluate(()=>{
      const shell=document.querySelector('.app-shell');const r=shell.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,background:getComputedStyle(shell).backgroundColor,body:getComputedStyle(document.body).backgroundColor,alerts:document.querySelectorAll('.preview-error').length};
    });
    assert.deepEqual(actual,{x:0,y:0,width:size.width,background:'rgb(0, 0, 0)',body:'rgb(0, 0, 0)',alerts:0});
  }
});
