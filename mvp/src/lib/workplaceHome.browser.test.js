import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("workplace home keeps distinct introductions and one shared scenario action", { timeout: 30000 }, async (t) => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => Promise.all([browser.close(), server.close()]));
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: new URL(route.request().url()).pathname.endsWith("/scenarios") ? "[]" : "{}" }));
  await page.goto(`${url}?service=workplace`);
  await page.locator("#workplace-scenarios").waitFor();
  assert.deepEqual(await page.locator(".workplace-scenario-card h3").allTextContents(), ["출근", "업무", "퇴근"]);
  assert.equal(await page.locator(".workplace-scenario-card button").count(), 0);
  assert.equal(await page.locator("#workplace-scenarios button").count(), 1);
  assert.equal(await page.locator(".workplace-workspace-section, .workplace-process-strip, .workplace-growth").count(), 0);
  assert.equal(await page.getByRole("region", { name: "서비스 강점 요약" }).count(), 0);
  assert.equal(await page.getByAltText("밝은 회의실에서 차분하게 업무 대화를 나누는 두 직장인").count(), 0);
  assert.equal(await page.locator(".dialogue-comparison").count(), 1);
  assert.equal(await page.locator(".home-fit-overview img").count(), 4);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `width ${width}`);
  }
  await page.getByRole("button", { name: "코칭 화면 미리보기", exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), "workplace-studio-tour");
  await page.locator("#workplace-scenarios button").click();
  await page.locator(".preview-page").waitFor();
  assert.deepEqual(errors, []);
});
