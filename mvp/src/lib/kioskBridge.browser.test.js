import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";
async function open(t, { resolveStatus = 200, retryStatus = "linked" } = {}) {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.clear();
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("regression: no devices", "NotAllowedError"); };
  });
  let polls = 0;
  const creates = [], retries = [];
  await context.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body = {}, status = 200;
    if (path === "/api/scenarios") body = [];
    if (path === "/api/nfc/tap") {
      polls += 1; body = { seq: polls > 1 ? 1 : 0, uid: polls === 2 ? "04AABBCC" : "", reader: "mirror", at: 1 };
    }
    if (path === "/api/nfc/resolve") {
      status = resolveStatus; body = { uid: "04AABBCC", kiosk_session_id: "MW2610030001", requires_role_selection: true };
    }
    if (path === "/api/sessions" && req.method() === "POST") {
      creates.push(req.postDataJSON());
      body = { id: 22, access_token: "test-only-capability", kiosk_link_status: "pending", mode: 5,
        scenario: { title: "테스트", characters: [] }, current_turn: { id: 221, question_text: "질문" } };
    }
    if (path === "/api/sessions/22/kiosk-link") {
      retries.push(req.headers()); body = { status: retryStatus };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(`${url}?service=workplace`);
  return { page, creates, retries };
}
async function startConfirmed(page) {
  await page.getByRole("heading", { name: "사원증을 확인했어요" }).waitFor();
  await page.locator(".nfc-fallback-roles button").click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "출근부터 시작하기", exact: true }).click();
  await page.locator(".practice-screen").waitFor();
}
test("confirmed card preserves snapshot and pending retry links the same session", { timeout: 45000 }, async t => {
  const { page, creates, retries } = await open(t);
  await startConfirmed(page);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].nfc_uid, "04AABBCC");
  assert.equal(creates[0].kiosk_session_id, "MW2610030001");
  assert.equal(creates[0].job_role, "office_admin");
  assert.equal(creates[0].scenario_slug, "workplace-conversation");
  await page.getByRole("button", { name: "사원증 연결 다시 시도" }).click();
  await page.getByRole("button", { name: "사원증 연결 다시 시도" }).waitFor({ state: "detached" });
  assert.equal(retries.length, 1);
  assert.equal(retries[0]["x-session-token"], "test-only-capability");
  assert.equal(creates.length, 1);
});
test("reissued-card retry shows conflict instead of claiming a result link", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { retryStatus: "conflict" });
  await startConfirmed(page);
  await page.getByRole("button", { name: "사원증 연결 다시 시도" }).click();
  await page.getByText(/사원증이 재발급되어 이 결과를 연결할 수 없어요/).waitFor();
  assert.equal(await page.getByRole("button", { name: "사원증 연결 다시 시도" }).count(), 0);
  assert.equal(creates.length, 1);
});
test("bridge unavailable displays connection error without a confirmed or manual card", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { resolveStatus: 503 });
  await page.getByText("사원증 서버 연결을 확인한 뒤 다시 태그해주세요.").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(creates.length, 0);
});
