import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("public pages share responsive layouts, accessible FAQ and working home actions", { timeout: 60000 }, async (t) => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => Promise.all([browser.close(), server.close()]));
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: new URL(route.request().url()).pathname.endsWith("/scenarios") ? "[]" : "{}" }));
  await page.goto(`${url}?service=interview&attract=3600`);
  for (const name of ["사이트 소개", "결과 및 기록", "사용방법"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name, exact: true }).click();
    await page.locator(".public-page").waitFor();
    assert.equal(await page.locator("h1").count(), 1);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} fits ${width}`);
    }
    if (name === "사이트 소개") {
      assert.equal(await page.locator(".public-mode-image").count(), 0);
      assert.doesNotMatch(await page.locator(".site-intro-page").innerText(), /면접|직업훈련|직장대화/);
      assert.equal(await page.locator(".public-fit-image").count(), 4);
      await page.locator(".public-fit-image").last().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll(".public-page img")].every(img => img.complete && img.naturalWidth > 0));
    }
    if (name === "사용방법") {
      assert.equal(await page.locator(".public-steps > li").count(), 4);
      const question = page.getByRole("button", { name: "Mirror-Ting은 무엇을 평가하나요?" });
      await question.focus();
      await page.keyboard.press("Enter");
      assert.equal(await question.getAttribute("aria-expanded"), "true");
      assert.notEqual(await question.evaluate(el => getComputedStyle(el).outlineStyle), "none");
      await page.keyboard.press("Space");
      assert.equal(await question.getAttribute("aria-expanded"), "false");
    }
    await page.getByRole("button", { name: "연습 홈으로 가기", exact: true }).click();
    await page.locator(".mode-home-page").waitFor();
  }
  assert.deepEqual(errors, []);
});

test("records keep real zero scores distinct from missing scores", { timeout: 30000 }, async (t) => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => Promise.all([browser.close(), server.close()]));
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/public-page-fixture", route => route.fulfill({ contentType: "text/html", body: `
    <div id="root" class="app-shell"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { ResultsHistoryPage } from '/src/pages/ResultsHistoryPage.jsx';
      import '/src/styles.css';
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ResultsHistoryPage, {
        history: [
          { session_id: 'old', title: '이전 연습', total_score: 95 },
          { session_id: 'zero', title: '영점 기록', total_score: 0 },
          { session_id: 'null', title: '미분석 기록', total_score: null },
          { session_id: 'blank', title: '빈 점수 기록', total_score: '' }
        ]
      }));
    </script>` }));
  const fixtureErrors = [];
  page.on("pageerror", error => fixtureErrors.push(error.message));
  await page.goto(`${url}public-page-fixture`);
  await page.locator(".records-item").first().waitFor({ timeout: 5000 }).catch(error => {
    throw new Error(`${error.message}; page errors: ${fixtureErrors.join("; ")}`);
  });
  assert.equal(await page.locator(".records-item").count(), 3);
  assert.deepEqual(await page.locator(".records-item b").allTextContents(), ["점수 없음", "점수 없음", "0점"]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
