import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("intro waves pause, remain decorative and respect mobile and reduced motion", { timeout: 30000 }, async (t) => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => Promise.all([browser.close(), server.close()]));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  await page.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: new URL(route.request().url()).pathname.endsWith("/scenarios") ? "[]" : "{}" }));
  await page.goto(`${url}?service=interview&attract=3600`);
  const preview = page.locator(".studio-tour");
  await preview.scrollIntoViewIfNeeded();
  const waves = preview.locator(".intro-waves");
  await page.waitForFunction(() => document.querySelector(".studio-tour > .intro-waves").dataset.running === "true");
  assert.equal(await waves.getAttribute("aria-hidden"), "true");
  assert.equal(await page.locator(".intro-waves").count(), 1);
  assert.equal(await waves.evaluate(el => Math.round(el.getBoundingClientRect().width) === Math.round(el.parentElement.getBoundingClientRect().width)), true);
  await preview.getByRole("button", { name: "배경 움직임 멈추기" }).click();
  assert.equal(await waves.getAttribute("data-running"), "false");
  assert.equal(await waves.locator("svg").evaluate(el => getComputedStyle(el).animationPlayState), "paused");
  await preview.getByRole("button", { name: "배경 움직임 재생" }).click();
  assert.equal(await waves.getAttribute("data-running"), "true");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (width <= 900) assert.equal(await page.locator(".studio-tour > .intro-waves svg").first().evaluate(el => getComputedStyle(el).animationName), "none");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".studio-tour > .intro-waves svg").first().evaluate(el => getComputedStyle(el).animationName), "none");
});
