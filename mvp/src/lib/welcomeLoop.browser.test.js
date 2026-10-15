import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("regenerated welcome video loops and pauses when the visitor starts", { timeout: 45000 }, async t => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const fixture = await mkdtemp(resolve(root, ".welcome-loop-"));
  t.after(async () => {
    assert.equal(dirname(resolve(fixture)), resolve(root));
    assert.ok(basename(fixture).startsWith(".welcome-loop-"));
    await rm(fixture, { recursive: true, force: true });
  });
  await writeFile(resolve(fixture, "index.html"), `<div id="root"></div><script type="module">
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { WorkplaceMirrorWelcomePage } from '/src/features/smart-mirror/components/WorkplaceMirrorWelcomePage.jsx';
    window.started = 0;
    createRoot(document.querySelector('#root')).render(React.createElement(WorkplaceMirrorWelcomePage, { onStart: () => window.started++ }));
  </script>`);
  const { server, url } = await startVite();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url + basename(fixture) + "/index.html");
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  assert.equal(await page.locator("video").evaluate(video => video.loop), true);
  await page.locator("video").evaluate(async video => {
    window.wraps = 0;
    let last = 0;
    video.addEventListener("timeupdate", () => {
      if (video.currentTime < last) window.wraps++;
      last = video.currentTime;
    });
    video.playbackRate = 8;
    await video.play();
  });
  await page.waitForFunction(() => window.wraps >= 2, null, { timeout: 15000 });
  await page.getByRole("button", { name: "화면을 눌러 시연 시작" }).click();
  assert.equal(await page.evaluate(() => window.started), 1);
  assert.equal(await page.locator("video").evaluate(video => video.paused), true);
});
