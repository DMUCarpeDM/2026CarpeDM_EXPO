import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";
import { startVite, withPage } from "./serviceEntryRouteHarness.js";

test("practice demo exposes input state and pause guidance without media", { timeout: 60_000 }, async () => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 768, 1440]) await withPage({ browser, baseUrl: url }, { query: "?demo=practice&attract=3600" }, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.locator(".practice-input-status").waitFor();
      assert.match(await page.locator(".practice-input-status").innerText(), /직접 입력|AI 질문 듣는 중/);
      assert.equal(await page.getByRole("button", { name: "음성 입력", exact: true }).isDisabled(), true);
      assert.equal(await page.locator(".typing-bubble").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.practice-answer-panel textarea').count(), 1);
      assert.equal(await page.locator('.camera-dialogue input').count(), 0);
      assert.equal(await page.locator('.practice-camera .counterpart-video').count() > 0, true);
      if (width < 900) {
        const question = await page.locator('#practice-question').boundingBox();
        const camera = await page.locator('.practice-camera').boundingBox();
        assert.ok(question.y < camera.y, 'mobile question precedes video');
        assert.ok(camera.height <= 340, 'mobile video stays compact');
      }
      assert.equal(await page.locator('.practice-answer-actions').getByRole('button', { name: '입력 지우기' }).count(), 1);
      await page.getByText('대화 기록', { exact: false }).filter({ has: page.locator('span') }).first().click();
      assert.equal(await page.locator('.chat-log-body').isVisible(), true);
      await page.locator('#practice-answer').fill('일시정지 중 보존할 답변');
      await page.getByRole("button", { name: "일시정지", exact: true }).click();
      assert.match(await page.locator(".practice-input-status").innerText(), /진행 일시정지/);
      assert.equal(await page.getByRole('button', { name: '전송', exact: true }).isDisabled(), true);
      await page.getByRole("button", { name: "연습 재개", exact: true }).click();
      assert.equal(await page.locator('#practice-answer').inputValue(), '일시정지 중 보존할 답변');
      assert.equal(await page.getByRole('button', { name: '전송', exact: true }).isEnabled(), true);
      await page.getByRole('button', { name: '연습 전체 화면', exact: true }).click();
      await page.waitForFunction(() => document.fullscreenElement?.classList.contains('practice-screen'));
      for (const selector of ['#practice-question', '#practice-answer', '.control-send', '.practice-contextbar']) {
        assert.equal(await page.locator(selector).evaluate(el => document.fullscreenElement.contains(el)), true);
      }
      await page.getByRole('button', { name: '전체 화면 닫기', exact: true }).click();
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.match(await page.locator(".practice-input-status").innerText(), /직접 입력|AI 질문 듣는 중/);
      await page.locator("#practice-answer").fill("테스트 답변");
      assert.equal(await page.getByRole("button", { name: "전송", exact: true }).isEnabled(), true);
      await page.getByRole("button", { name: "입력 지우기", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "전송", exact: true }).isDisabled(), true);
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await mkdir("../.omo/evidence/practice-status", { recursive: true });
      await page.screenshot({ path: `../.omo/evidence/practice-status/${width}.png`, fullPage: true });
      assert.deepEqual(pageErrors, []);
    });
  } finally { await browser.close(); await server.close(); }
});
