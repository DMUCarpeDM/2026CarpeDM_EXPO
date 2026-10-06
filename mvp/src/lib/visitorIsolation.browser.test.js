import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

const marker = "VISITOR_A_PRIVATE_REGRESSION";
const report = { session_id: 21, total_score: 75,
  fit_scores: { response: { score: 75, summary: marker }, voice: { score: null }, expression: { score: null }, posture: { score: null } },
  strengths: [marker], improvements: [], headline: { sentence: marker }, coaching: [], day_ending: {},
  speech_stats: {}, evidence_segments: [], deep_analysis: {}, rebuild: {}, mode: 5 };
const json = (route, body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });

async function open(t, { saved = true, holdReport = false, holdCreate = false } = {}) {
  const { server, url } = await startVite();
  let browser;
  t.after(async () => { await browser?.close(); await server.close(); });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(({ saved }) => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("no hardware in regression", "NotAllowedError"); };
    localStorage.setItem("mirror-ting-client-key", "visitor-a-client");
    if (saved) localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 21, access_token: "test-only-token" }));
  }, { saved });
  let release, requested;
  const requestSeen = new Promise(resolve => { requested = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/report")) {
      if (holdReport) { requested(); await held; }
      return json(route, report);
    }
    if (path === "/api/sessions" && route.request().method() === "POST") {
      if (holdCreate) { requested(); await held; }
      return json(route, { id: 22, access_token: "new-test-only-token", current_turn: { id: 221, question_text: "질문" } });
    }
    const body = path === "/api/scenarios" ? []
      : path === "/api/sessions/21" ? { id: 21, status: "completed", scenario: { title: "test" }, history: [] }
        : path.endsWith("/progress") ? { status: "completed", stage: "done", pct: 100 }
          : path === "/api/history" ? { items: [{ session_id: 21, total_score: 75 }] } : {};
    return json(route, body);
  });
  const page = await context.newPage();
  await page.goto(`${url}?service=workplace`);
  return { page, requestSeen, release };
}

async function newVisitor(page) {
  await page.getByRole("button", { name: "Mirror-Ting 모드 선택", exact: true }).click();
  await page.locator(".service-mode-page").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("mirror-ting-active-session")), null);
  assert.equal(await page.evaluate(() => localStorage.getItem("mirror-ting-client-key")), null);
  await page.getByRole("button", { name: "직장대화", exact: true }).click();
  await page.locator(".home-mode-workplace").waitFor();
}

test("a new visitor cannot reopen the completed prior visitor report", { timeout: 45000 }, async t => {
  const { page } = await open(t);
  await page.getByText(marker, { exact: true }).first().waitFor();
  await newVisitor(page);
  await page.getByRole("button", { name: "결과 및 기록", exact: true }).click();
  await page.locator(".records-page").waitFor();
  assert.equal((await page.locator("body").innerText()).includes(marker), false);
  assert.equal(await page.locator(".report-page").count(), 0);
});

test("a report arriving after reset cannot refill the new visitor state or storage", { timeout: 45000 }, async t => {
  const { page, requestSeen, release } = await open(t, { holdReport: true });
  await requestSeen;
  await newVisitor(page);
  release();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "결과 및 기록", exact: true }).click();
  await page.locator(".records-page").waitFor();
  assert.equal((await page.locator("body").innerText()).includes(marker), false);
  assert.equal(await page.evaluate(() => localStorage.getItem("mirror-ting-retained-records")), null);
});

test("a session creation arriving after reset cannot start the next visitor practice", { timeout: 45000 }, async t => {
  const { page, requestSeen, release } = await open(t, { saved: false, holdCreate: true });
  await page.locator(".home-mode-workplace").waitFor();
  await page.getByRole("button", { name: "연습 시작하기", exact: true }).first().click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "출근부터 시작하기", exact: true }).click();
  await requestSeen;
  await newVisitor(page);
  release();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".practice-screen").count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("mirror-ting-active-session")), null);
});
