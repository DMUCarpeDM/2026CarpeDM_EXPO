import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("interface QA: mobile practice, modal focus and reduced-motion idle screen", { timeout: 45000 }, async (t) => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => Promise.all([browser.close(), server.close()]));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("QA permission denied", "NotAllowedError"); };
  });
  await context.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: new URL(route.request().url()).pathname.endsWith("/scenarios") ? "[]" : "{}" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${url}?demo=practice`);
  await page.locator(".practice-screen").waitFor();
  const skipVoice = page.getByRole("button", { name: "목소리 분석 없이 연습", exact: true });
  if (await skipVoice.isVisible()) await skipVoice.click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px does not overflow`);
  }
  assert.equal(await page.getByRole("main").count(), 1);
  assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
  assert.ok(await page.getByLabel("답변 입력").count());
  const finish = page.getByRole("button", { name: "연습 종료", exact: true });
  await finish.click();
  const dialog = page.getByRole("dialog", { name: "연습 종료 확인" });
  assert.equal(await dialog.getByRole("button", { name: "계속 연습" }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await dialog.getByRole("button", { name: "연습 종료", exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Escape");
  assert.equal(await finish.evaluate(el => el === document.activeElement), true);
  await page.goto(`${url}?service=interview&attract=1`);
  const idle = page.getByRole("dialog", { name: "연습 서비스 안내" });
  await idle.waitFor();
  assert.equal(await idle.getAttribute("data-paused"), "true");
  assert.equal(await idle.getByRole("button", { name: "자동 전환 멈추기" }).count(), 0);
  const heading = await idle.getByRole("heading").innerText();
  await page.waitForTimeout(4800);
  assert.equal(await idle.getByRole("heading").innerText(), heading, "reduced motion stops slide rotation");
  await page.keyboard.press("Escape");
  await idle.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
});
