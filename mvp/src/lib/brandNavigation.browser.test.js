import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("brand returns every service deep link to the selector and allows switching modes", { timeout: 30000 }, async (t) => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => Promise.all([browser.close(), server.close()]));
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: new URL(route.request().url()).pathname.endsWith("/scenarios") ? "[]" : "{}" }));
  for (const mode of ["interview", "training", "workplace"]) {
    await page.goto(`${url}?service=${mode}`);
    await page.locator(`.home-mode-${mode}`).waitFor();
    await page.getByRole("button", { name: "Mirror-Ting 모드 선택", exact: true }).click();
    await page.locator(".service-mode-page").waitFor();
    assert.equal(await page.locator(".service-mode-card").count(), 3);
    assert.equal(new URL(page.url()).searchParams.has("service"), false);
    await page.reload();
    await page.locator(".service-mode-page").waitFor();
    const next = mode === "workplace" ? ["면접", "interview"] : ["직장대화", "workplace"];
    await page.getByRole("button", { name: next[0], exact: true }).click();
    await page.locator(`.home-mode-${next[1]}`).waitFor();
  }
});
