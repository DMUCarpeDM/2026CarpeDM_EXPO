import assert from "node:assert/strict";
import { join } from "node:path";
import {
  activeSessionKey,
  capture,
  routeTrace,
  withPage,
} from "./serviceEntryRouteHarness.js";
import { savedStorage } from "./serviceEntryDirectScenarios.js";

export async function runResumes(pageHarness, runDir) {
  const observations = [];
  for (const status of ["in_progress", "analyzing", "completed"]) {
    observations.push(await withPage(pageHarness, { storage: savedStorage, resume: status }, async ({ page, calls, pageErrors }) => {
      const selector = status === "in_progress" ? ".practice-screen" : ".report-page";
      await page.locator(selector).first().waitFor();
      const trace = await routeTrace(page);
      const nfcCalls = calls.filter((path) => path === "/api/nfc/tap").length;
      assert.equal(trace.some((entry) => entry.selector), false, `${status} resume never renders selector`);
      assert.equal(nfcCalls, 0, `${status} resume does not poll NFC`);
      assert.deepEqual(pageErrors, []);
      await capture(page, join(runDir, `resume-${status}.png`), status === "in_progress" ? ".chat-log-card" : ".report-page");
      return { status, trace, nfcCalls };
    }));
  }
  return observations;
}

export async function runFallbacks(pageHarness, runDir) {
  const observations = [];
  for (const resume of ["error", "timeout", "missing", "unknown"]) {
    observations.push(await withPage(pageHarness, {
      storage: savedStorage,
      resume,
      controlClock: resume === "timeout",
    }, async ({ page, calls, pageErrors }) => {
      let clock = null;
      if (resume === "timeout") {
        await page.locator(".app-boot").waitFor({ state: "attached" });
        assert.equal(await page.locator("button, a, input, select, textarea").count(), 0);
        await capture(page, join(runDir, "saved-timeout-boot.png"), ".app-boot");
        await page.clock.runFor(2_999);
        assert.equal(await page.locator(".app-boot").count(), 1, "boot remains neutral before the lookup deadline");
        assert.equal(await page.locator(".service-mode-page").count(), 0, "selector has no pre-timeout first paint");
        await page.clock.runFor(1);
        clock = { bootThroughMs: 2_999, serviceAtMs: 3_000 };
      }
      await page.locator(".service-mode-page").waitFor({ timeout: 5_000 });
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), activeSessionKey), null);
      assert.equal(await page.evaluate(() => localStorage.getItem("keep-me")), "yes");
      assert.equal(calls.filter((path) => path === "/api/nfc/tap").length, 0);
      assert.deepEqual(pageErrors, []);
      if (resume === "timeout") await page.clock.runFor(500);
      await capture(page, join(runDir, `fallback-${resume}-service.png`), ".setup-flow-page");
      return { resume, clock, trace: await routeTrace(page) };
    }));
  }
  return observations;
}
