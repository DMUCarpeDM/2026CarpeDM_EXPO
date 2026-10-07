import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

async function open(t, { external = true, agreed = true, media = true } = {}) {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, reducedMotion: "reduce", permissions: ["camera", "microphone"] });
  await context.addInitScript(({ media }) => {
    localStorage.clear();
    localStorage.setItem("mirror-ting-client-key", "prior-test-only-key");
    if (!media) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("test: devices unavailable", "NotAllowedError"); };
  }, { media });
  let polls = 0;
  const creates = [];
  await context.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body = {};
    if (path === "/api/scenarios") body = [];
    if (path === "/api/nfc/tap") { polls += 1; body = { seq: polls > 1 ? 1 : 0, uid: polls === 2 ? "04AABBCC" : "", reader: "mirror", at: 1 }; }
    if (path === "/api/nfc/resolve") body = external
      ? { uid: "04AABBCC", kiosk_session_id: "MW2610070001", requires_role_selection: true }
      : { uid: "04AABBCC", job_role: "office_admin", scenario_slug: "workplace-conversation", issued_count: 3, consent_agreed: agreed, consent_agreed_at: agreed ? "2026-10-07T03:00:00Z" : null };
    if (path === "/api/sessions" && req.method() === "POST") {
      creates.push(req.postDataJSON());
      body = { id: 22, access_token: "test-only-capability", kiosk_link_status: "linked", mode: 5,
        scenario: { slug: "workplace-conversation", title: "테스트", characters: [] }, current_turn: { id: 221, question_text: "질문" } };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(`${url}?service=workplace&mirror=1`);
  if (external) {
    await page.getByRole("heading", { name: "사원증을 확인했어요" }).waitFor();
    await page.locator(".nfc-fallback-roles button").click();
  }
  await page.locator(".mirror-summary").waitFor();
  await page.clock.install();
  return { page, creates };
}

test("external mirror card waits for explicit consent, then starts once with its snapshot", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t);
  await page.clock.fastForward(44000);
  assert.equal(creates.length, 0);
  await page.getByRole("checkbox").click();
  await page.clock.fastForward(44000);
  await page.locator(".practice-screen").waitFor();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].kiosk_session_id, "MW2610070001");
  assert.equal(creates[0].nfc_uid, "04AABBCC");
  assert.equal(creates[0].consent.agreed, true);
  assert.notEqual(creates[0].client_key, "prior-test-only-key");
  assert.equal("nfc_issued_count" in creates[0], false);
  await page.clock.fastForward(44000);
  assert.equal(creates.length, 1);
});

test("local kiosk consent retains the current issuance guard and automatic scene flow", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { external: false });
  await page.clock.fastForward(44000);
  await page.locator(".practice-screen").waitFor();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].nfc_issued_count, 3);
  assert.equal("kiosk_session_id" in creates[0], false);
});

test("a local card without current consent cannot start after automatic scene time", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { external: false, agreed: false });
  await page.clock.fastForward(44000);
  await page.getByRole("heading", { name: "키오스크에서 먼저 동의해 주세요." }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(creates.length, 0);
});

test("mirror device failure cannot create a session even with explicit consent", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { media: false });
  await page.getByRole("checkbox").click();
  await page.clock.fastForward(44000);
  await page.getByRole("heading", { name: "연습을 준비하지 못했어요." }).waitFor();
  assert.equal(creates.length, 0);
});
