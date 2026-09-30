import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
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
        assert.equal(await page.getByRole("button", { name: "면접 시작하기", exact: true }).isDisabled(), true);
        await page.getByText("면접 진행 안내", { exact: true }).click();
        assert.equal(await page.locator(".interview-ready details").getAttribute("open"), "");
        await page.getByText("면접 진행 안내", { exact: true }).click();
        const artifacts = "../.omo/evidence/interview-preflight";
        await mkdir(artifacts, { recursive: true });
        await page.screenshot({ path: `${artifacts}/${width}.png`, fullPage: true });
        await page.getByRole("checkbox").check();
        assert.equal(await page.getByRole("button", { name: "면접 시작하기", exact: true }).isEnabled(), true);
        await page.getByRole("button", { name: "이전", exact: true }).click();
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
