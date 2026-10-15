import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("overview shows the enabled exhibition scene and a top progress line for twenty seconds", { timeout: 45000 }, async t => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.clock.install();
  const preview = `${url}src/features/smart-mirror/previews/flow/4k.html`;
  await page.goto(`${preview}?scene=morning`);
  const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
  await frame.locator(".mirror-overview").waitFor();
  assert.equal(await frame.locator(".overview-steps").count(), 0);
  const progress = frame.getByRole("progressbar", { name: "대화 시작까지 진행" });
  assert.equal(await progress.count(), 1);
  const line = await progress.locator("i").evaluate(el => ({ color: getComputedStyle(el).backgroundColor, height: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top }));
  assert.deepEqual(line, { color: "rgb(255, 255, 255)", height: 2, top: 0 });
  const artwork = frame.locator(".overview-art img");
  assert.equal(await artwork.count(), 1);
  assert.match(await frame.locator(".overview-scenario-description").innerText(), /첫 출근한 신입 사원/);
  assert.equal(await frame.locator(".overview-card-context h2").innerText(), "출근 첫인사와 자기소개");
  assert.equal(await artwork.evaluate(el => el.getAnimations().length), 0);
  await page.clock.fastForward(19000);
  assert.equal(await frame.locator(".mirror-overview").count(), 1);
  assert.ok(Number(await progress.getAttribute("aria-valuenow")) > 0);
  assert.ok(Number(await progress.getAttribute("aria-valuenow")) < 100);
  await page.clock.fastForward(1500);
  await frame.waitForURL(/simulation\/scene\.html\?scene=morning/);
  await page.goto(`${preview}?scene=leaving&still=1`);
  const still = await (await page.locator("iframe").elementHandle()).contentFrame();
  await still.locator(".mirror-overview").waitFor();
  await page.clock.fastForward(60000);
  assert.equal(await still.locator(".mirror-overview").count(), 1);
  assert.equal(await still.locator(".overview-scene-badge").innerText(), "퇴근");
});

test("all three simulation categories start without a briefing or countdown", { timeout: 45000 }, async t => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const scene of ["morning", "work", "leaving"]) {
    await page.goto(`${url}src/features/smart-mirror/previews/simulation/scene.html?scene=${scene}`);
    await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
    assert.equal(await page.locator("dialog, .mirror-countdown-track").count(), 0);
    assert.equal(await page.locator(".simulation-card-slot").count(), 1);
  }
});
