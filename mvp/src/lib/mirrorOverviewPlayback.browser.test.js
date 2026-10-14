import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("overview shows one static scene, a top progress line and detailed copy for fifteen seconds", { timeout: 45000 }, async t => {
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
  assert.match(await frame.locator(".overview-scenario-description").innerText(), /직장 선배가 연애 여부/);
  assert.equal(await frame.locator(".overview-card-context h2").innerText(), "연애 이야기를 계속 묻는 선배");
  assert.equal(await artwork.evaluate(el => el.getAnimations().length), 0);
  await page.clock.fastForward(14000);
  assert.equal(await frame.locator(".mirror-overview").count(), 1);
  assert.ok(Number(await progress.getAttribute("aria-valuenow")) > 0);
  assert.ok(Number(await progress.getAttribute("aria-valuenow")) < 100);
  await page.clock.fastForward(1500);
  await frame.waitForURL(/simulation\/scene\.html\?scene=morning/);
  await page.goto(`${preview}?scene=work&still=1`);
  const still = await (await page.locator("iframe").elementHandle()).contentFrame();
  await still.locator(".mirror-overview").waitFor();
  await page.clock.fastForward(60000);
  assert.equal(await still.locator(".mirror-overview").count(), 1);
  assert.equal(await still.locator(".overview-scene-badge").innerText(), "업무");
});

test("glass modal uses shared progress bar and closes automatically after five seconds", { timeout: 45000 }, async t => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, reducedMotion: "reduce" });
  await page.clock.install();
  for (const scene of ["morning", "work", "leaving"]) {
    await page.goto(`${url}src/features/smart-mirror/previews/simulation/4k.html?scene=${scene}&modal=preview`);
    const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
    const dialog = frame.getByRole("dialog");
    await dialog.waitFor();
    await page.clock.fastForward(2000);
    assert.equal(await dialog.isVisible(), true);
    const progress = dialog.getByRole("progressbar");
    assert.equal(await progress.getAttribute("aria-valuemax"), "5");
    assert.equal(await progress.getAttribute("aria-valuenow"), "2");
    assert.equal(await dialog.locator(".overview-summary-card").count(), 1);
    assert.equal(await dialog.getAttribute("aria-describedby"), "mirror-briefing-description");
    const style = await dialog.locator(".overview-summary-card").evaluate(el => ({ blur: getComputedStyle(el).backdropFilter, animation: getComputedStyle(el).animationName }));
    assert.match(style.blur, /blur\(8px\)/);
    assert.equal(style.animation, "mirror-modal-fade");
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), true);
    await page.clock.fastForward(2000);
    assert.equal(await dialog.isVisible(), true);
    await page.clock.fastForward(1500);
    await dialog.waitFor({ state: "hidden" });
    await frame.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  }
});
