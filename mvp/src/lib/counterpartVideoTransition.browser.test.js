import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("workplace keeps its current frame while the next clip loads and pauses both buffers", { timeout: 45000 }, async t => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const fixture = await mkdtemp(resolve(root, ".video-transition-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await writeFile(resolve(fixture, "index.html"), `<div id="root"></div><script type="module">
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{CounterpartVideo}from'/src/components/practice/CounterpartVideo.jsx';
    function App(){const[state,setState]=useState('speaking');const[paused,setPaused]=useState(false);return React.createElement(React.Fragment,null,
      React.createElement('button',{onClick:()=>setState('listening')},'듣기'),
      React.createElement('button',{onClick:()=>setState('speaking')},'말하기'),
      React.createElement('button',{onClick:()=>setPaused(true)},'멈춤'),
      React.createElement('div',{style:{position:'relative',width:360,height:640}},React.createElement(CounterpartVideo,{characterId:'park_senior',category:'morning',state,paused})));}
    createRoot(document.getElementById('root')).render(React.createElement(App));
  </script>`);
  const { server, url } = await startVite();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let requested;
  const requestStarted = new Promise(resolve => { requested = resolve; });
  await page.route("**/morning/listening.mp4", async route => { requested(); await held; await route.continue(); });
  await page.goto(url + basename(fixture) + "/index.html");
  const visible = page.locator('.counterpart-video-transition video[aria-hidden="false"]');
  await page.waitForFunction(() => document.querySelector('video[aria-hidden="false"]')?.currentTime > .1);
  await page.getByRole("button", { name: "듣기", exact: true }).click();
  await requestStarted;
  assert.match(await visible.getAttribute("src"), /speaking-base\.mp4/);
  assert.equal(await visible.evaluate(v => getComputedStyle(v).opacity), "1");
  assert.ok(await visible.evaluate(v => v.readyState >= 2 && !v.paused));
  release();
  await page.waitForFunction(() => document.querySelector('video[aria-hidden="false"]')?.currentSrc.includes('listening.mp4'));
  await page.waitForTimeout(250);
  assert.equal(await visible.evaluate(v => getComputedStyle(v).opacity), "1");
  assert.ok(await visible.evaluate(v => v.currentTime > 0 && !v.paused));
  assert.equal(await page.locator("video").count(), 2);
  await page.getByRole("button", { name: "말하기", exact: true }).click();
  await page.getByRole("button", { name: "듣기", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video[aria-hidden="false"]')?.currentSrc.includes('listening.mp4'));
  await page.getByRole("button", { name: "멈춤", exact: true }).click();
  assert.ok(await page.locator("video").evaluateAll(videos => videos.every(v => v.paused)));
});
