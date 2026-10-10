import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("4K overview plays all scenes while still=1 explicitly freezes a scene", { timeout: 45000 }, async t => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, reducedMotion: "no-preference" });
  await page.clock.install();
  const preview = `${url}src/features/smart-mirror/previews/flow/4k.html`;
  await page.goto(`${preview}?scene=morning&backdrop=city`);
  const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
  await frame.locator('.mirror-overview[data-scene="0"]').waitFor();
  await page.clock.fastForward(8000);
  await frame.locator('.mirror-overview[data-scene="1"]').waitFor();
  await page.clock.fastForward(10000);
  await frame.locator('.mirror-overview[data-scene="2"]').waitFor();
  await page.clock.fastForward(12000);
  await frame.getByRole("dialog").waitFor();
  await page.clock.fastForward(13000);
  await frame.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.match(frame.url(), /simulation\/scene\.html\?scene=morning/);
  assert.equal(await frame.getByText("안내 완료 · 자동 전환 확인").count(), 0);
  await frame.locator(".simulation-actor video").waitFor();
  await frame.getByText("미리보기 · 녹음 안 함", { exact: true }).waitFor();
  assert.equal(await frame.getByText("카메라 꺼짐", { exact: true }).count(), 1);
  assert.equal(await frame.locator('.mirror-capture-wave i').count(), 7);
  assert.equal(await frame.locator('.mirror-capture-audio[data-active="true"]').count(), 0);
  await page.goto(`${preview}?scene=work&still=1`);
  const still = await (await page.locator("iframe").elementHandle()).contentFrame();
  await still.locator('.mirror-overview[data-scene="1"]').waitFor();
  await page.clock.fastForward(60000);
  assert.equal(await still.locator('.mirror-overview[data-scene="1"]').count(), 1);
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
