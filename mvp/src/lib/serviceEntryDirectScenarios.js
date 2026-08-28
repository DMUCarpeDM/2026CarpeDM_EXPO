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
    ["feedback", ".feedback-page", ".feedback-page"],
    ["compare", ".compare-report", ".compare-report"],
    ["share", ".share-page", ".share-page"],
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
      if (demo === "feedback") {
        await page.getByRole("button", { name: "다시 연습하기", exact: true }).click();
        await page.locator(".preview-page").waitFor();
        assert.equal((await routeTrace(page)).some((entry) => entry.selector), false, "feedback retry retains setup and skips selector");
      }
      if (demo === "compare") await page.getByRole("button", { name: /Practice Again/ }).click();
      if (demo === "share") await page.getByRole("button", { name: /다른 연습하기/ }).click();
      if (["compare", "share"].includes(demo)) await page.locator(".service-mode-page").waitFor();
      return {
        demo, trace, nfcCalls,
        sameScenarioDestination: demo === "feedback" ? "preview" : null,
        newPracticeDestination: ["compare", "share"].includes(demo) ? "service" : null,
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
