import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

async function open(t, { external = true, agreed = true, media = true, tap = true, briefing = false, live = false, voice = false, pendingCalibration = false, failFirstCalibration = false } = {}) {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--mute-audio", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, reducedMotion: "no-preference", permissions: ["camera", "microphone"] });
  await context.addInitScript(({ media, voice }) => {
    localStorage.clear();
    localStorage.setItem("mirror-ting-client-key", "prior-test-only-key");
    window.__restoreTestMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    if (!media) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("test: devices unavailable", "NotAllowedError"); };
    if (media === "audio") navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints.video) throw new DOMException("test: camera unavailable", "NotFoundError");
      return window.__restoreTestMedia(constraints);
    };
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
      if (failFirstCalibration && calibrations.length === 0) body = { status: "unmeasured", reason: "insufficient_speech" };
      calibrations.push(capture);
      if (pendingCalibration) { heldCalibration = () => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }); return; }
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  await page.goto(`${url}?service=workplace&mirror=1${live ? "&test=live" : ""}`);
  if (!tap) {
    await page.getByRole("region", { name: "미러팅 시연 안내" }).waitFor();
    return { page, creates };
  }
  if (!media) await page.getByRole("heading", { name: "연결 상태를 확인해 주세요." }).waitFor();
  else if (external) await page.locator(".mirror-overview").waitFor();

  else await page.locator(".mirror-overview").waitFor();
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 2000));
  return { page, creates, calibrations, finishCalibration: () => heldCalibration?.() };
}

test("external mirror card starts on tagging without another icon click or role-selection screen", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t);
  assert.equal(creates.length, 1);
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

test("an unissued card enters anonymous practice without linking the card", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { external: false, agreed: false });
  await page.locator(".mirror-overview").waitFor();
  assert.equal(creates.length, 1);
  for (const key of ["nfc_uid", "nfc_issued_count", "kiosk_session_id"]) assert.equal(key in creates[0], false);
});


test("mirror device failure cannot create a session even with explicit consent", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { media: false });
  await page.clock.fastForward(58000);
  await page.getByRole("alert").filter({ hasText: "카메라·마이크 권한이 차단" }).waitFor();
  await page.getByRole("heading", { name: "연결 상태를 확인해 주세요." }).waitFor();
  assert.equal(creates.length, 0);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__restoreTestMedia; });
  await page.getByRole("button", { name: "장치 연결 후 다시 시작" }).click();
  await page.locator(".mirror-overview").waitFor();
  assert.equal(creates.length, 1);
});

test("mirror continues with a real microphone stream when camera is unavailable", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { tap: false, media: "audio" });
  await page.getByRole("button", { name: "화면을 눌러 시연 시작" }).click();
  await page.locator(".mirror-overview").waitFor();
  await page.getByText("카메라가 연결되지 않아 음성 대화로 진행해요. 표정·자세 분석은 제공되지 않아요.").waitFor();
  await page.clock.install();
  await page.clock.fastForward(34000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(creates.length, 1);
});


test("mirror entry shows only video and prepared Iris audio before any NFC tag", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { tap: false });
  assert.equal(await page.locator(".mirror-deployment .mirror-welcome").count(), 1);
  assert.equal(await page.locator(".mode-home-page").count(), 0);
  assert.equal(await page.locator(".mirror-welcome audio").count(), 1);
  assert.equal(await page.locator(".mirror-city-surface, .mirror-nfc-symbol, .overview-summary-card").count(), 0);
  assert.equal(await page.locator(".mirror-welcome-start").textContent(), "");
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(await page.locator(".overview-steps, .overview-art, .mirror-overview").count(), 0);
  await page.clock.install();
  await page.clock.fastForward(58000);
  assert.equal(creates.length, 0);
  await page.getByRole("region", { name: "미러팅 시연 안내" }).waitFor();
});


test("welcome video starts an actual session without a test query or separate consent UI", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { tap: false });
  await page.getByRole("button", { name: "화면을 눌러 시연 시작" }).click();
  await page.locator('.mirror-overview[data-scene="0"]').waitFor();
  await page.clock.install();
  await page.clock.fastForward(34000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].consent.agreed, true);
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(await page.locator(".nfc-fallback-roles").count(), 0);
});


test("mirror session skips situation popups and immediately starts dialogue", { timeout: 45000 }, async t => {
  const { page } = await open(t, { external: false, briefing: true });
  await page.clock.fastForward(34000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByText("음성 녹음 중", { exact: true }).waitFor();
  assert.equal(await page.locator(".simulation-card-slot").count(), 1);
});

test("4K mirror microphone popup uses glass, records automatically, and hides dialogue until calibration finishes", { timeout: 45000 }, async t => {
  const { page, calibrations } = await open(t, { external: false, briefing: true, voice: true });
  await page.setViewportSize({ width: 2160, height: 3840 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.fastForward(34000);
  const popup = page.getByRole("dialog", { name: "아래 문장을 큰 목소리로 읽어요." });
  await popup.waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const box = await popup.boundingBox();
  assert.ok(box.width >= 1800 && box.x >= 0 && box.x + box.width <= 2160);
  assert.ok(box.y >= 0 && box.y + box.height <= 3840);
  const surface = await popup.locator(".overview-summary-card").evaluate(element => ({ blur: getComputedStyle(element).backdropFilter, background: getComputedStyle(element).backgroundImage }));
  assert.match(surface.blur, /blur\(16px\)/);
  assert.match(surface.background, /gradient/);
  assert.ok(await popup.evaluate(el => Boolean(el.querySelector(".mirror-microphone-sentence").compareDocumentPosition(el.querySelector(".mirror-microphone-steps")) & Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.ok(await popup.locator("h2").evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 80);
  assert.equal(await popup.getByRole("button").count(), 0);
  assert.equal(await popup.locator(".mirror-countdown-track").count(), 0);
  assert.equal(await popup.locator(".mirror-microphone-note").count(), 0);
  assert.equal(await page.locator(".simulation-card-slot").count(), 0);
  await mkdir("../.omo/evidence/mirror-microphone", { recursive: true });
  await page.screenshot({ path: "../.omo/evidence/mirror-microphone/4k.png" });
  await page.keyboard.press("Escape");
  assert.equal(await popup.isVisible(), true);
  await page.clock.runFor(600);
  assert.equal(await popup.locator('li[aria-current="step"]').innerText(), "01\n주변 소음\n2초");
  await page.clock.runFor(2000);
  await popup.locator('.mirror-microphone-sentence[data-active="true"]').waitFor();
  await page.clock.runFor(900);
  await page.clock.runFor(4000);
  await popup.waitFor({ state: "hidden" });
  assert.equal(calibrations.length, 1);
  const recordings = await page.evaluate(() => window.__recordings.slice(0, 2));
  assert.equal(Math.round(recordings[0].stop - recordings[0].start), 2000);
  assert.equal(Math.round(recordings[1].stop - recordings[1].start), 4000);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator(".simulation-card-slot").count(), 1);
  await page.getByText("음성 녹음 중", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test("mirror microphone waits past 10 seconds until calibration succeeds", { timeout: 45000 }, async t => {
  const { page, calibrations, finishCalibration } = await open(t, { external: false, briefing: true, voice: true, pendingCalibration: true });
  await page.clock.fastForward(34000);
  const popup = page.getByRole("dialog", { name: "아래 문장을 큰 목소리로 읽어요." });
  await popup.waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.runFor(600);
  await page.clock.runFor(2000);
  await popup.locator('.mirror-microphone-sentence[data-active="true"]').waitFor();
  await page.clock.runFor(900);
  await page.clock.runFor(4000);
  assert.equal(await popup.locator("#mirror-microphone-instruction").count(), 0);
  assert.equal(calibrations.length, 1);
  await page.clock.runFor(15000);
  assert.equal(await popup.isVisible(), true);
  assert.equal(await page.locator(".simulation-card-slot").count(), 0);
  await finishCalibration();
  await popup.waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.getByText("목소리 기준 미확인 · 음성 입력은 계속돼요.", { exact: true }).count(), 0);
  await page.getByText("음성 녹음 중", { exact: true }).waitFor();
  assert.equal(await page.locator(".simulation-card-slot").count(), 1);
});


test("live mirror entry creates a real anonymous session from the disclosed NFC start action", { timeout: 45000 }, async t => {
  const { page, creates } = await open(t, { tap: false, live: true });
  assert.equal(creates.length, 0);
  await page.getByRole("button", { name: "화면을 눌러 시연 시작" }).click();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  await page.locator(".mirror-overview").waitFor();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].consent.agreed, true);
  assert.equal(creates[0].scenario_slug, "workplace-conversation");
  for (const key of ["nfc_uid", "nfc_issued_count", "kiosk_session_id"]) assert.equal(key in creates[0], false);
  await page.clock.install();
  await page.clock.fastForward(34000);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(creates.length, 1);
  for (const name of ["제출한 답변으로 결과 보기", "답변 보내기"]) assert.equal(await page.getByRole("button", { name }).count(), 0);

  assert.equal(await page.getByText("미리보기 · 녹음 안 함", { exact: true }).count(), 0);
});


test("mirror microphone failure stays blocked and offers retry", { timeout: 45000 }, async t => {
  const { page, calibrations } = await open(t, { external: false, briefing: true, voice: true, failFirstCalibration: true });
  await page.clock.fastForward(34000);
  const popup = page.getByRole("dialog", { name: "아래 문장을 큰 목소리로 읽어요." });
  await popup.waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.runFor(600);
  await page.clock.runFor(2000);
  await popup.locator('.mirror-microphone-sentence[data-active="true"]').waitFor();
  await page.clock.runFor(900);
  await page.clock.runFor(4000);
  const retry = popup.getByRole("button", { name: "마이크 다시 확인" });
  await retry.waitFor();
  await page.clock.runFor(15000);
  assert.equal(await popup.isVisible(), true);
  assert.equal(await page.locator(".simulation-card-slot").count(), 0);
  await retry.click();
  await page.clock.runFor(2000);
  await popup.locator('.mirror-microphone-sentence[data-active="true"]').waitFor();
  await page.clock.runFor(900);
  await page.clock.runFor(4000);
  await popup.waitFor({ state: "hidden" });
  assert.equal(calibrations.length, 2);
});
