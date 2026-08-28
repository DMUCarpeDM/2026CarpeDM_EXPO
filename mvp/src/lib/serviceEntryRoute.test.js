import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { describe } from "node:test";
import { chromium } from "playwright";
import { runDirectDemos, runKiosk, runRetry } from "./serviceEntryDirectScenarios.js";
import { runReportIdleReset } from "./serviceEntryIdleScenario.js";
import {
  artifactParent,
  startVite,
} from "./serviceEntryRouteHarness.js";
import { runFallbacks, runResumes } from "./serviceEntryResumeScenarios.js";
import { runFreshSelection, runNfcReset, runServiceCards } from "./serviceEntrySelectionScenarios.js";
import {
  CHROMELESS_VIEWS,
  demoDestination,
  isKioskIssue,
  normalizeDestination,
  savedSessionDestination,
} from "./serviceEntryRoute.js";

test("service entry policy declares deterministic precedence and chrome", () => {
  assert.deepEqual([...CHROMELESS_VIEWS], ["service"]);
  assert.equal(isKioskIssue("?kiosk=issue&demo=practice"), true);
  assert.equal(demoDestination("?demo=practice"), "practice");
  for (const view of ["result", "feedback", "compare", "share"]) assert.equal(demoDestination(`?demo=${view}`), view);
  assert.equal(demoDestination(""), null);
  assert.equal(savedSessionDestination("in_progress"), "practice");
  assert.equal(savedSessionDestination("analyzing"), "result");
  assert.equal(savedSessionDestination("completed"), "result");
  assert.equal(savedSessionDestination("unknown"), null);
  assert.equal(normalizeDestination("home", null), "service");
  assert.equal(normalizeDestination("home", "training"), "home");
});

describe("service entry routes in real Vite and Chrome", { concurrency: false }, () => {
  let runDir;
  let server;
  let browser;
  let pageHarness;
  const result = { status: "running", observed: {}, errors: [] };

  test.before(async () => {
    await mkdir(artifactParent, { recursive: true });
    runDir = await mkdtemp(join(artifactParent, `run-${new Date().toISOString().replaceAll(/[-:.]/g, "")}-`));
    result.runDir = runDir;
    const harness = await startVite();
    server = harness.server;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    result.viteUrl = harness.url;
    pageHarness = { browser, baseUrl: harness.url };
  });

  const scenario = (name, key, run) => test(name, { timeout: 60_000 }, async () => {
    try {
      result.observed[key] = await run();
    } catch (error) {
      result.errors.push({ scenario: key, name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack });
      throw error;
    }
  });

  scenario("fresh selection, history, and full reset", "fresh", () => runFreshSelection(pageHarness, runDir));
  scenario("all service cards retain their selected home", "cards", () => runServiceCards(pageHarness));
  scenario("service reset removes NFC direct-entry state", "nfcReset", () => runNfcReset(pageHarness));
  scenario("direct demo routes bypass the selector", "demos", () => runDirectDemos(pageHarness, runDir));
  scenario("saved sessions resume by status", "resumes", () => runResumes(pageHarness, runDir));
  scenario("invalid saved sessions fall back at the controlled deadline", "fallbacks", () => runFallbacks(pageHarness, runDir));
  scenario("kiosk issue mode overrides demo and resume", "kiosk", () => runKiosk(pageHarness, runDir));
  scenario("same-scenario retry retains preview setup", "retry", () => runRetry(pageHarness, runDir));
  scenario("report activity restarts idle reset", "reportIdle", () => runReportIdleReset(pageHarness));

  test.after(async () => {
    const cleanup = await Promise.allSettled([browser?.close(), server?.close()]);
    result.cleanup = cleanup.map((entry, index) => ({ resource: index === 0 ? "chrome" : "vite", status: entry.status, reason: entry.status === "rejected" ? String(entry.reason) : undefined }));
    const cleanupErrors = cleanup.filter((entry) => entry.status === "rejected").map((entry) => entry.reason);
    result.status = result.errors.length || cleanupErrors.length ? "failed" : "passed";
    await writeFile(join(runDir, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`service entry browser artifacts: ${runDir}`);
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "browser harness cleanup failed");
  });
});
