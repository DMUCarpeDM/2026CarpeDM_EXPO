import assert from "node:assert/strict";
import { activeSessionKey, routeTrace, withPage } from "./serviceEntryRouteHarness.js";
import { savedStorage } from "./serviceEntryDirectScenarios.js";

export async function runReportIdleReset(pageHarness) {
  return withPage(pageHarness, {
    query: "?demo=result",
    storage: savedStorage,
    controlClock: true,
  }, async ({ page, calls, pageErrors }) => {
    await page.locator(".report-page").waitFor();
    await page.clock.runFor(89_999);
    assert.equal(await page.locator(".report-page").count(), 1, "report remains before its idle deadline");
    await page.dispatchEvent(".report-page", "pointerdown");
    await page.clock.runFor(89_999);
    assert.equal(await page.locator(".report-page").count(), 1, "pointer activity restarts the full idle window");
    await page.clock.runFor(1);
    await page.locator(".service-mode-page").waitFor();
    assert.equal(await page.locator(".top-nav, .mobile-menu-layer").count(), 0);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), activeSessionKey), null);
    assert.equal(await page.evaluate(() => localStorage.getItem("keep-me")), "yes");
    assert.equal(calls.filter((path) => path === "/api/nfc/tap").length, 0);
    assert.deepEqual(pageErrors, []);
    const selectorLabels = await page.locator(".service-mode-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
    assert.deepEqual(selectorLabels, ["면접", "직업훈련", "직장대화"]);
    return {
      clock: { firstBoundaryMs: 89_999, activity: "pointerdown", secondBoundaryMs: 89_999, resetAtMs: 90_000 },
      activeSessionCleared: true,
      unrelatedStorageRetained: true,
      selectorLabels,
      trace: await routeTrace(page),
    };
  });
}
