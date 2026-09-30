import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite, withPage } from "./serviceEntryRouteHarness.js";

test("interview question-focused setup retains choices at responsive widths", { timeout: 90_000 }, async () => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 768, 1440]) {
      await withPage({ browser, baseUrl: url }, { query: "?service=interview&attract=3600" }, async ({ page, pageErrors }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.locator(".studio-hero__actions button").first().click();
        await page.locator(".interview-focus").waitFor();
        assert.equal(await page.locator(".setup-next-button").isDisabled(), true);
        const checkLayout = async () => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.equal(await page.locator(".interview-progress").count(), 1);
          assert.equal(await page.locator("main h1").count(), 1);
        };
        await checkLayout();
        await page.getByRole("button", { name: /풀스택 개발자/ }).press("Enter");
        await page.locator(".setup-next-button").click();
        await page.getByRole("button", { name: /일반면접 6개 질문/ }).click();
        await checkLayout();
        await page.locator(".setup-back-button").click();
        assert.equal(await page.getByRole("button", { name: /풀스택 개발자/ }).getAttribute("aria-pressed"), "true");
        await page.locator(".setup-next-button").click();
        assert.equal(await page.getByRole("button", { name: /일반면접 6개 질문/ }).getAttribute("aria-pressed"), "true");
        await page.locator(".setup-next-button").click();
        await page.locator(".difficulty-choice-section").waitFor();
        await checkLayout();
        assert.equal(await page.locator(".difficulty-choice-section button").count(), 1);
        await page.locator(".setup-next-button").click();
        await page.locator(".interview-preflight").waitFor();
        await checkLayout();
        assert.equal(await page.getByRole("checkbox").isChecked(), false);
        await page.goBack();
        await page.locator(".difficulty-choice-section").waitFor();
        assert.equal(await page.locator('.difficulty-choice-section [aria-pressed="true"]').count(), 1);
        assert.deepEqual(pageErrors, []);
      });
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
