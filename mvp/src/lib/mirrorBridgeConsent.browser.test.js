import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

async function open(t, { external = true, agreed = true, media = true, tap = true, briefing = false, live = false, voice = false, pendingCalibration = false } = {}) {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, reducedMotion: "no-preference", permissions: ["camera", "microphone"] });
  await context.addInitScript(({ media, voice }) => {
    localStorage.clear();
    localStorage.setItem("mirror-ting-client-key", "prior-test-only-key");
    if (!media) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("test: devices unavailable", "NotAllowedError"); };
    if (voice) {
      // Deterministic WAV clips let the browser clock test recording deadlines.
      window.__recordings = [];
      window.MediaRecorder = class {
        static isTypeSupported() { return true; }
        constructor() { this.state = "inactive"; this.mimeType = "audio/wav"; }
        start() { this.state = "recording"; this.sample = { start: performance.now() }; window.__recordings.push(this.sample); }
        requestData() {}
        stop() {
          this.state = "inactive"; this.sample.stop = performance.now();
          const buffer = new ArrayBuffer(16044), view = new DataView(buffer);
          const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
          text(0, "RIFF"); view.setUint32(4, 16036, true); text(8, "WAVE"); text(12, "fmt ");
          view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
          view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true);
          view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, 16000, true);
          this.ondataavailable?.({ data: new Blob([buffer], { type: this.mimeType }) });
          this.onstop?.();
        }
      };
    }
  }, { media, voice });
  let polls = 0;
  const creates = [];
  const calibrations = [];
  let heldCalibration;
  await context.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body = {};
    if (path === "/api/scenarios") body = [];
    if (path === "/api/nfc/tap") { polls += 1; body = { seq: tap && polls > 1 ? 1 : 0, uid: tap && polls === 2 ? "04AABBCC" : "", reader: "mirror", at: 1 }; }
    if (path === "/api/nfc/resolve") body = external
      ? { uid: "04AABBCC", kiosk_session_id: "MW2610070001", requires_role_selection: true }
      : { uid: "04AABBCC", job_role: "office_admin", scenario_slug: "workplace-conversation", issued_count: 3, consent_agreed: agreed, consent_agreed_at: agreed ? "2026-10-07T03:00:00Z" : null };
    if (path === "/api/sessions" && req.method() === "POST") {
      creates.push(req.postDataJSON());
      body = { id: 22, access_token: "test-only-capability", kiosk_link_status: "linked", mode: 5,
        ...(voice ? { voice_analysis: { engine_version: "voice-measure-v2", calibration: null } } : {}),
        scenario: { slug: "workplace-conversation", title: "테스트", characters: [] },
        interaction: { ...(briefing ? { mode: "workplace_continuous", briefing: { category_id: "morning", category_label: "출근", title: "출근 테스트 상황", situation: "업무 자료를 확인하는 상황", tip: "질문 정리", step: 1, total: 3 } } : {}), overview: ["morning", "work", "leaving"].map(category_id => ({ category_id, virtual_time: "09:00", situation: "테스트 상황", goal: "테스트 연습 목표" })) }, current_turn: { id: 221, question_text: "질문" } };
    }
    if (path.endsWith("/voice/calibration") && req.method() === "POST") {
      const capture = JSON.parse(req.postDataBuffer().toString().match(/name="capture"\r\n\r\n([^\r]+)/)[1]);
      body = { id: "mirror-calibration", status: "measured", reference_rms: .07, capture };
      calibrations.push(capture);
      if (pendingCalibration) { heldCalibration = () => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }); return; }
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(`${url}?service=workplace&mirror=1${live ? "&test=live" : ""}`);
  if (!tap) {
    await page.getByRole("heading", { name: live ? "아이콘을 눌러 체험을 시작해요." : "사원증을 태그해 주세요." }).waitFor();
    return { page, creates };
  }
  if (external) {
    await page.getByRole("heading", { name: "사원증을 확인했어요" }).waitFor();
    await page.locator(".nfc-fallback-roles button").click();
  }
  await page.locator(external || !agreed ? ".mirror-summary" : ".mirror-overview").waitFor();
  await page.clock.install();
  return { page, creates, calibrations, finishCalibration: () => heldCalibration?.() };
}

test("external mirror card waits for explicit consent, then starts once with its snapshot", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t);
  await page.clock.fastForward(58000);
  assert.equal(creates.length, 0);
  await page.getByRole("checkbox").click();
  await page.locator(".mirror-overview").waitFor();
  await page.clock.fastForward(58000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].kiosk_session_id, "MW2610070001");
  assert.equal(creates[0].nfc_uid, "04AABBCC");
  assert.equal(creates[0].consent.agreed, true);
  assert.notEqual(creates[0].client_key, "prior-test-only-key");
  assert.equal("nfc_issued_count" in creates[0], false);
  await page.clock.fastForward(58000);
  assert.equal(creates.length, 1);
});

test("local kiosk consent retains the current issuance guard and automatic scene flow", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { external: false });
  await page.clock.fastForward(58000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(creates.length, 1);
  await page.getByText("음성 녹음 중", { exact: true }).waitFor();
  assert.equal(await page.locator('.mirror-capture-audio[data-active="true"]').count(), 1);
  assert.equal(await page.locator('.mirror-capture-wave i').count(), 7);
  assert.equal(creates[0].nfc_issued_count, 3);
  assert.equal("kiosk_session_id" in creates[0], false);
});

test("a local card without current consent cannot start after automatic scene time", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { external: false, agreed: false });
  await page.clock.fastForward(58000);
  await page.getByRole("heading", { name: "키오스크에서 먼저 동의해 주세요." }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(creates.length, 0);
});

test("mirror device failure cannot create a session even with explicit consent", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { media: false });
  await page.getByRole("checkbox").click();
  await page.clock.fastForward(58000);
  await page.getByRole("heading", { name: "연습을 준비하지 못했어요." }).waitFor();
  assert.equal(creates.length, 0);
});


test("mirror entry shows a separate NFC waiting page before any NFC tag", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { tap: false });
  assert.equal(await page.locator(".mirror-deployment .mirror-nfc-waiting").count(), 1);
  assert.equal(await page.locator(".mode-home-page").count(), 0);
  const cityBackground = await page.locator(".mirror-city-surface").evaluate(element => getComputedStyle(element, "::before").backgroundImage);
  assert.match(cityBackground, /glass-city/);
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(await page.locator(".overview-steps, .overview-art, .mirror-overview").count(), 0);
  await page.clock.install();
  await page.clock.fastForward(58000);
  assert.equal(creates.length, 0);
  await page.getByRole("heading", { name: "사원증을 태그해 주세요." }).waitFor();
});


test("development NFC icon opens overview then simulation without creating a visitor session", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { tap: false });
  await page.getByRole("link", { name: "NFC 없이 요약 화면 테스트" }).click();
  await page.locator('.mirror-overview[data-scene="0"]').waitFor();
  await page.clock.install();
  await page.clock.fastForward(34000);
  await page.getByRole("dialog").waitFor();
  await page.clock.fastForward(13000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(creates.length, 0);
});


test("mirror session shows a separate situation popup before recording starts", { timeout: 45000 }, async t => {
  const { page } = await open(t, { external: false, briefing: true });
  await page.clock.fastForward(34000);
  await page.getByRole("dialog", { name: "출근 테스트 상황" }).waitFor();
  assert.equal(await page.locator(".simulation-card-slot").count(), 0);
  assert.equal(await page.locator('.mirror-capture-audio[data-active="true"]').count(), 0);
  await page.clock.fastForward(13000);
  await page.getByRole("dialog", { name: "출근 테스트 상황" }).waitFor({ state: "hidden" });
  await page.getByText("음성 녹음 중", { exact: true }).waitFor();
  assert.equal(await page.locator(".simulation-card-slot").count(), 1);
});

test("4K mirror microphone popup uses glass, records automatically, and hides dialogue behind both popups", { timeout: 45000 }, async t => {
  const { page, calibrations } = await open(t, { external: false, briefing: true, voice: true });
  await page.setViewportSize({ width: 2160, height: 3840 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.fastForward(34000);
  const popup = page.getByRole("dialog", { name: "내 목소리를 확인할게요." });
  await popup.waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const box = await popup.boundingBox();
  assert.ok(box.width >= 1800 && box.x >= 0 && box.x + box.width <= 2160);
  assert.ok(box.y >= 0 && box.y + box.height <= 3840);
  const surface = await popup.locator(".overview-summary-card").evaluate(element => ({ blur: getComputedStyle(element).backdropFilter, background: getComputedStyle(element).backgroundImage }));
  assert.match(surface.blur, /blur\(8px\)/);
  assert.match(surface.background, /gradient/);
  assert.ok(await popup.locator("h2").evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 80);
  assert.equal(await popup.getByRole("button").count(), 0);
  assert.equal(await page.locator(".simulation-card-slot").count(), 0);
  await mkdir("../.omo/evidence/mirror-microphone", { recursive: true });
  await page.screenshot({ path: "../.omo/evidence/mirror-microphone/4k.png" });
  await page.keyboard.press("Escape");
  assert.equal(await popup.isVisible(), true);
  await page.clock.runFor(600);
  assert.equal(await popup.locator('li[aria-current="step"]').innerText(), "01\n주변 소음\n2초 · 조용히 기다리기");
  await page.clock.runFor(2000);
  await popup.locator('.mirror-microphone-sentence[data-active="true"]').waitFor();
  await page.clock.runFor(900);
  await page.clock.runFor(4000);
  await popup.waitFor({ state: "hidden" });
  assert.equal(calibrations.length, 1);
  const recordings = await page.evaluate(() => window.__recordings.slice(0, 2));
  assert.equal(Math.round(recordings[0].stop - recordings[0].start), 2000);
  assert.equal(Math.round(recordings[1].stop - recordings[1].start), 4000);
  await page.getByRole("dialog", { name: "출근 테스트 상황" }).waitFor();
  assert.equal(await page.locator(".simulation-card-slot").count(), 0);
  await page.clock.runFor(5100);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".simulation-card-slot").count(), 1);
  await page.getByText("음성 녹음 중", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test("mirror microphone deadline continues speech input at 10 seconds and ignores a late calibration result", { timeout: 45000 }, async t => {
  const { page, calibrations, finishCalibration } = await open(t, { external: false, briefing: true, voice: true, pendingCalibration: true });
  await page.clock.fastForward(34000);
  const popup = page.getByRole("dialog", { name: "내 목소리를 확인할게요." });
  await popup.waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.runFor(600);
  await page.clock.runFor(2000);
  await popup.locator('.mirror-microphone-sentence[data-active="true"]').waitFor();
  await page.clock.runFor(900);
  await page.clock.runFor(4000);
  await page.waitForFunction(() => document.querySelector("#mirror-microphone-instruction")?.textContent.includes("녹음 상태"));
  assert.equal(calibrations.length, 1);
  await page.clock.runFor(2500);
  await popup.waitFor({ state: "hidden" });
  await page.getByRole("dialog", { name: "출근 테스트 상황" }).waitFor();
  await finishCalibration();
  await page.clock.runFor(5100);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("목소리 기준 미확인 · 음성 입력은 계속돼요.", { exact: true }).waitFor();
  await page.getByText("음성 녹음 중", { exact: true }).waitFor();
  assert.equal(await page.locator(".simulation-card-slot").count(), 1);
});


test("development live mirror test requires consent and creates a real anonymous session", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { tap: false, live: true });
  await page.getByRole("button", { name: "사원증 없이 실제 체험 시작" }).click();
  await page.getByRole("checkbox").waitFor();
  assert.equal(creates.length, 0);
  await page.getByRole("checkbox").click();
  await page.locator(".mirror-overview").waitFor();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].consent.agreed, true);
  assert.equal(creates[0].scenario_slug, "workplace-conversation");
  for (const key of ["nfc_uid", "nfc_issued_count", "kiosk_session_id"]) assert.equal(key in creates[0], false);
  await page.clock.install();
  await page.clock.fastForward(34000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(creates.length, 1);
  await page.getByRole("button", { name: "제출한 답변으로 결과 보기" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "제출한 답변으로 결과 보기" }).isDisabled(), true);
  assert.equal(await page.getByText("미리보기 · 녹음 안 함", { exact: true }).count(), 0);
});
