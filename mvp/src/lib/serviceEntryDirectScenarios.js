import assert from "node:assert/strict";
import { join } from "node:path";
import { activeSessionKey, capture, routeTrace, withPage } from "./serviceEntryRouteHarness.js";

export const savedStorage = {
  [activeSessionKey]: JSON.stringify({ id: "saved", access_token: "token" }),
  "keep-me": "yes",
};

export async function runDirectDemos(pageHarness, runDir) {
  const observations = [];
  const demos = [
    ["practice", ".practice-screen", ".chat-log-card"],
    ["result", ".report-page", ".report-page"],
    ["feedback", ".report-page", ".report-page"],
    ["compare", ".report-page", ".report-page"],
    ["share", ".report-page", ".report-page"],
  ];
  for (const [demo, selector, stableSelector] of demos) {
    observations.push(await withPage(pageHarness, { query: `?demo=${demo}`, storage: savedStorage }, async ({ page, calls, pageErrors }) => {
      await page.locator(selector).first().waitFor();
      const trace = await routeTrace(page);
      const nfcCalls = calls.filter((path) => path === "/api/nfc/tap").length;
      assert.equal(trace.some((entry) => entry.selector), false, `${demo} never renders selector`);
      assert.equal(calls.some((path) => path === "/api/sessions/saved"), false, `${demo} takes precedence over resume`);
      assert.equal(nfcCalls, 0, `${demo} does not poll NFC`);
      assert.deepEqual(pageErrors, []);
      await capture(page, join(runDir, `direct-demo-${demo}.png`), stableSelector);
      if (demo !== "practice") {
        assert.equal(await page.locator(".feedback-page, .compare-report, .share-page").count(), 0, `${demo} uses the single report surface`);
        assert.equal(trace.some((entry) => entry.route === "result"), true, `${demo} normalizes to result`);
      }
      return {
        demo, trace, nfcCalls,
        normalizedDestination: demo === "practice" ? "practice" : "result",
      };
    }));
  }
  return observations;
}

export async function runKiosk(pageHarness, runDir) {
  return withPage(pageHarness, { query: "?kiosk=issue&demo=practice", storage: savedStorage }, async ({ page, calls, pageErrors }) => {
    await page.locator(".kiosk-issue-screen").waitFor();
    const trace = await routeTrace(page);
    const nfcCalls = calls.filter((path) => path === "/api/nfc/tap").length;
    assert.equal(trace.some((entry) => entry.selector), false);
    assert.equal(calls.some((path) => path === "/api/sessions/saved"), false);
    assert.equal(nfcCalls, 0);
    assert.deepEqual(pageErrors, []);
    await capture(page, join(runDir, "direct-kiosk.png"), ".kiosk-issue-step");
    return { trace, nfcCalls };
  });
}

export async function runRetry(pageHarness, runDir) {
  return withPage(pageHarness, { query: "?demo=result" }, async ({ page, calls, pageErrors }) => {
    await page.getByRole("button", { name: /같은 상황 다시 연습/ }).click();
    await page.locator(".preview-page").waitFor();
    const trace = await routeTrace(page);
    const nfcCalls = calls.filter((path) => path === "/api/nfc/tap").length;
    assert.equal(trace.some((entry) => entry.selector), false);
    assert.equal(nfcCalls, 0);
    assert.deepEqual(pageErrors, []);
    await capture(page, join(runDir, "direct-retry-preview.png"), ".preview-page");
    return { trace, nfcCalls };
  });
}
