import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("all service homes explain four fits with the existing image assets", { timeout: 30000 }, async (t) => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => Promise.all([browser.close(), server.close()]));
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: new URL(route.request().url()).pathname.endsWith("/scenarios") ? "[]" : "{}" }));
  for (const mode of ["interview", "training", "workplace"]) {
    await page.goto(`${url}?service=${mode}&attract=3600`);
    const overview = page.locator(".home-fit-overview");
    await overview.scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".studio-eyebrow").count(), 0);
    assert.equal(await page.locator(".studio-hero__copy h1").evaluate(el => getComputedStyle(el).fontWeight), "700");
    assert.equal(await page.locator(".section-intro h2").first().evaluate(el => getComputedStyle(el).fontWeight), "590");
    assert.equal(await page.getByText("4-Fit 코칭 리포트", { exact: true }).count(), 0);
    assert.equal(await overview.count(), 1);
    assert.deepEqual(await overview.locator("h3").allTextContents(), ["응답", "목소리", "표정", "자세"]);
    await page.waitForFunction(() => [...document.querySelectorAll(".home-fit-overview img")].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await overview.locator("img").count(), 4);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${mode} at ${width}`);
    }
  }
  assert.deepEqual(errors, []);
});
