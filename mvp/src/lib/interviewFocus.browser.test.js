import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startVite, withPage } from "./serviceEntryRouteHarness.js";

test("prompt landing preserves explanations and input at responsive widths", { timeout: 90_000 }, async () => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 768, 1440]) {
      await withPage({ browser, baseUrl: url }, { query: "?attract=3600" }, async ({ page, pageErrors }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.locator("#home-scenario-prompt").waitFor();
        assert.equal(await page.locator("textarea").count(), 2);
        assert.doesNotMatch(await page.locator(".home-page").innerText(), /10자 이상 입력하면 시작할 수 있어요/);
        assert.equal(await page.locator("#home-scenario-prompt").evaluate(node => getComputedStyle(node).resize), "none");
        assert.equal(await page.locator(".top-nav").evaluate(node => getComputedStyle(node).borderBottomWidth), "0px");
        assert.doesNotMatch(await page.locator(".home-page").innerText(), /직업.?훈련|Mirror-Ting은 어떤 서비스인가요|3,000자|MIRROR-TING/);
        assert.equal(await page.locator(".prompt-home-eyebrow, #home-prompt-help, .prompt-home-explore").count(), 0);
        const modePicker = page.getByRole("combobox", { name: "연습 모드", exact: true }).first();
        await modePicker.click();
        assert.equal(await page.getByRole("option").count(), 2);
        assert.equal(await page.getByRole("option", { selected: true }).count(), 1);
        await modePicker.press("Escape");
        assert.equal(await modePicker.getAttribute("aria-expanded"), "false");
        await page.getByRole("button", { name: "입력한 상황으로 연습 준비하기", exact: true }).first().click();
        assert.match(await page.getByRole("alert").innerText(), /10자 이상/);
        assert.equal(await page.locator("#home-scenario-prompt").getAttribute("aria-invalid"), "true");
        assert.match(await page.locator(".home-page").innerText(), /응답, 목소리, 표정, 자세/);
        await mkdir("../.omo/evidence/prompt-home", { recursive: true });
        await page.screenshot({ path: `../.omo/evidence/prompt-home/${width}.png` });
        const checkLayout = async () => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.ok(await page.locator(".mini-stepper").count() <= 1);
          assert.equal(await page.locator("main h1").count(), 1);
        };
        await checkLayout();
        const prompt = "개발자 면접에서 프로젝트 성과와 협업 경험을 설명하고 꼬리질문에 답하고 싶습니다.";
        await page.locator("#home-scenario-prompt").fill(prompt);
        await modePicker.click();
        await modePicker.press("Home");
        await modePicker.press("Enter");
        assert.equal(await modePicker.getAttribute("aria-expanded"), "false");
        assert.match(await page.locator("#home-scenario-prompt").getAttribute("placeholder"), /면접/);
        assert.equal(await page.locator("#home-scenario-prompt").inputValue(), prompt);
        assert.match(await page.locator(".home-page").innerText(), /머릿속으로만 준비했던 답변/);
        await page.getByRole("button", { name: "입력한 상황으로 연습 준비하기", exact: true }).first().click();
        await page.locator(".difficulty-choice-section").waitFor();
        await checkLayout();
        assert.equal(await page.locator(".difficulty-choice-section button").count(), 3);
        await page.locator(".setup-back-button").click();
        assert.equal(await page.locator("#home-scenario-prompt").inputValue(), prompt);
        assert.equal(await page.locator("#footer-scenario-prompt").inputValue(), prompt);
        await page.locator("#footer-scenario-prompt").fill(prompt + " 하단 입력도 확인합니다.");
        assert.equal(await page.locator("#home-scenario-prompt").inputValue(), prompt + " 하단 입력도 확인합니다.");
        await page.locator('.mode-footer-cta .prompt-home-toolbar button[type="submit"]').click();
        await page.locator(".setup-next-button").click();
        await page.locator(".prompt-preflight").waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.getByRole("checkbox").isChecked(), false);
        const start = page.getByRole("button", { name: "동의하고 생성·시작하기", exact: true });
        assert.equal(await start.isDisabled(), true);
        const artifacts = "../.omo/evidence/interview-preflight";
        await mkdir(artifacts, { recursive: true });
        await page.screenshot({ path: `${artifacts}/${width}.png`, fullPage: true });
        await page.getByRole("checkbox").check();
        assert.equal(await start.isEnabled(), true);
        await page.getByRole("button", { name: "이전 단계", exact: true }).click();
        await page.locator(".difficulty-choice-section").waitFor();
        assert.equal(await page.locator('.difficulty-choice-section [aria-pressed="true"]').count(), 1);
        assert.deepEqual(pageErrors, []);
      });
    }
    await withPage({ browser, baseUrl: url }, {}, async ({ page, pageErrors }) => {
      await page.locator(".hero-typing-word").waitFor();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      for (const word of ["면접", "출근", "회식", "미팅", "회의"]) {
        await page.waitForFunction(expected => document.querySelector(".hero-typing-word")?.textContent === expected, word, { timeout: 6000 });
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => document.querySelector(".hero-typing-word")?.textContent === "면접");
      await page.waitForTimeout(2300);
      assert.equal(await page.locator(".hero-typing-word").innerText(), "면접");
      assert.deepEqual(pageErrors, []);
    });
  } finally {
    await browser.close();
    await server.close();
  }
});
