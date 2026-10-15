import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

async function open(t, { resolveStatus = 200, linkStatus = null, retryStatus = "linked" } = {}) {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--mute-audio", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ viewport: { width: 800, height: 1280 },
    hasTouch: true, reducedMotion: "reduce", permissions: ["camera", "microphone"] });
  await context.addInitScript(({ resume }) => {
    localStorage.clear();
    if (resume) localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 22, access_token: "test-only-capability" }));
  }, { resume: Boolean(linkStatus) });
  let polls = 0;
  const creates = [], retries = [], errors = [];
  await context.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let status = 200, body = {};
    const session = { id: 22, status: "completed", access_token: "test-only-capability",
      kiosk_link_status: linkStatus, mode: 5, service_mode: "workplace",
      scenario: { slug: "workplace-conversation", title: "테스트", characters: [] },
      interaction: { mode: "workplace_continuous", overview: ["morning", "work", "leaving"].map(category_id => ({ category_id, situation: "테스트 상황", goal: "테스트 연습 목표" })) },
      current_turn: { id: 221, question_text: "질문" } };
    if (path === "/api/scenarios" || path === "/api/reports/history") body = [];
    if (path === "/api/nfc/tap") {
      polls += 1; body = { seq: polls > 1 ? 1 : 0, uid: polls === 2 ? "04AABBCC" : "", reader: "mirror", at: 1 };
    }
    if (path === "/api/nfc/resolve") {
      status = resolveStatus;
      body = { uid: "04AABBCC", kiosk_session_id: "MW2610150001", requires_role_selection: true };
    }
    if (path === "/api/sessions/22") body = session;
    if (path === "/api/sessions" && req.method() === "POST") {
      creates.push(req.postDataJSON()); body = { ...session, status: "in_progress", kiosk_link_status: "not_requested" };
    }
    if (path.endsWith("/progress")) body = { status: "completed", stage: "done", pct: 100 };
    if (path.endsWith("/report")) body = { session_id: 22, total_score: null, fit_scores: {}, strengths: [], improvements: [] };
    if (path.endsWith("/kiosk-link")) {
      retries.push({ path, headers: req.headers() }); body = { status: retryStatus };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${url}?service=workplace&mirror=1&idle=0`);
  return { page, creates, retries, errors };
}

for (const status of [404, 503]) {
  test(`mirror card lookup ${status} starts anonymous practice without requiring kiosk issuance`, { timeout: 45000 }, async t => {
    const { page, creates, errors } = await open(t, { resolveStatus: status });
    await page.locator(".mirror-overview").waitFor();
    assert.equal(creates.length, 1);
    assert.equal(await page.locator(".mirror-welcome").count(), 0);
    for (const field of ["nfc_uid", "nfc_issued_count", "kiosk_session_id"]) {
      assert.equal(field in creates[0], false, `unverified card must not supply ${field}`);
    }
    assert.equal(creates[0].consent.agreed, true);
    assert.equal(creates[0].exhibition, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (status === 404) {
      await mkdir("../.omo/evidence/nfc-printer-link", { recursive: true });
      await page.screenshot({ path: "../.omo/evidence/nfc-printer-link/random-card-start.png" });
    }
    await page.clock.install();
    await page.clock.fastForward(58000);
    await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
    assert.equal(creates.length, 1, "automatic preparation must reuse the same session");
    assert.deepEqual(errors, []);
  });
}

test("mirror report reconnects the same session and shows where to print", { timeout: 45000 }, async t => {
  const { page, creates, retries, errors } = await open(t, { linkStatus: "pending" });
  const button = page.getByRole("button", { name: "사원증 연결 다시 시도" });
  await button.waitFor();
  assert.equal(await button.isVisible(), true);
  await button.tap();
  await page.getByText("리포트가 준비됐어요. 출력 키오스크에서 같은 사원증을 태그해 주세요.").waitFor();
  assert.equal(creates.length, 0);
  assert.equal(retries.length, 1);
  assert.equal(retries[0].path, "/api/sessions/22/kiosk-link");
  assert.equal(retries[0].headers["x-session-token"], "test-only-capability");
  await mkdir("../.omo/evidence/nfc-printer-link", { recursive: true });
  await page.screenshot({ path: "../.omo/evidence/nfc-printer-link/report-linked.png" });
  assert.deepEqual(errors, []);
});

test("mirror anonymous result does not promise kiosk printing", { timeout: 45000 }, async t => {
  const { page, errors } = await open(t, { linkStatus: "not_requested" });
  await page.getByText(/사원증 없이 시작한 체험이에요/).waitFor();
  assert.equal(await page.getByText(/리포트가 준비됐어요. 출력 키오스크/).count(), 0);
  assert.deepEqual(errors, []);
});
