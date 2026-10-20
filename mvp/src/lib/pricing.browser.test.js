import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startVite, withPage } from "./serviceEntryRouteHarness.js";

test("pricing and account entry work at desktop, tablet and mobile sizes", { timeout: 90_000 }, async () => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [1440, 1066, 768, 390]) {
      await withPage({ browser, baseUrl: url }, {}, async ({ page, pageErrors }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.locator("#home-scenario-prompt").waitFor();
        assert.equal(await page.locator(".bell-button, .profile-button").count(), 0);
        await page.getByRole("button", { name: "로그인", exact: true }).click();
        await page.locator(".account-page").waitFor();
        assert.equal(await page.getByLabel("이메일", { exact: true }).isVisible(), true);
        await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
        await page.getByLabel("이름", { exact: true }).waitFor();
        if (width <= 1000) {
          await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
          await page.getByRole("navigation", { name: "모바일 주요 화면" }).getByRole("button", { name: "요금제", exact: true }).click();
        } else {
          await page.getByRole("navigation", { name: "주요 화면", exact: true }).getByRole("button", { name: "요금제", exact: true }).click();
        }
        await page.locator(".pricing-page").waitFor();
        assert.deepEqual(await page.locator(".pricing-card h2").allTextContents(), ["Plus", "Pro", "Business", "Enterprise"]);
        const columns = await page.locator(".pricing-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        assert.equal(columns, width >= 1000 ? 4 : width === 768 ? 2 : 1);
        assert.equal(await page.getByRole("button", { name: "기업 서비스 준비 중", exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: "맞춤형 서비스 준비 중", exact: true }).isDisabled(), true);
        assert.match(await page.locator(".pricing-enterprise-note").innerText(), /서비스 제공사.*별도 개발과 구축/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await mkdir("../.omo/evidence/pricing", { recursive: true });
        await page.screenshot({ path: `../.omo/evidence/pricing/${width}.png`, fullPage: true });
        await page.getByRole("button", { name: "연습할 상황 적기", exact: true }).first().click();
        await page.locator("#home-scenario-prompt").waitFor();
        assert.deepEqual(pageErrors, []);
      });
    }
    await withPage({ browser, baseUrl: url }, {}, async ({ page, pageErrors }) => {
      await page.route("**/api/auth/**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/me")) return route.fulfill({ json: { name: "테스트 사용자", email: "test@example.com" } });
        const body = route.request().postDataJSON();
        if (body.password === "wrong-password") return route.fulfill({ status: 401, json: { detail: "이메일 또는 비밀번호가 올바르지 않습니다" } });
        return route.fulfill({ json: { access_token: "browser-test-token" } });
      });
      await page.locator("#home-scenario-prompt").waitFor();
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await page.getByLabel("이메일", { exact: true }).fill("test@example.com");
      await page.getByLabel("비밀번호", { exact: true }).fill("wrong-password");
      await page.locator(".account-submit").click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /비밀번호/);
      await page.getByLabel("비밀번호", { exact: true }).fill("example-password");
      await page.locator(".account-submit").click();
      await page.getByRole("heading", { name: "로그인했어요", exact: true }).waitFor();
      await page.getByRole("button", { name: "로그아웃", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "회원가입", exact: true }).isVisible(), true);
      assert.equal(await page.evaluate(() => sessionStorage.getItem("mirror-ting-web-account")), null);
      assert.deepEqual(pageErrors, []);
    });
  } finally { await browser.close(); await server.close(); }
});
