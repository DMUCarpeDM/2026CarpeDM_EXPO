import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("voice calibration gates speech, carries capture settings, and resets after microphone changes", { timeout: 60_000 }, async (t) => {
  const { server, url } = await startVite();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  let calibrationRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 21, access_token: "test-token" }));
    window.__speeches = 0;
    window.__micSettings = { deviceId: "test-mic", sampleRate: 48000, channelCount: 1, autoGainControl: false, noiseSuppression: false, echoCancellation: true };
    navigator.mediaDevices.getUserMedia = async () => {
      if (!window.__testStream) {
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        oscillator.connect(destination); oscillator.start();
        window.__testAudioContext = context;
        window.__testStream = destination.stream;
        destination.stream.getAudioTracks()[0].getSettings = () => ({ ...window.__micSettings });
      }
      return window.__testStream;
    };
    Object.defineProperty(window.speechSynthesis, "speak", { value: (utterance) => { window.__speeches++; setTimeout(() => utterance.onend?.(), 10); } });
  });
  const scenario = { slug: "interview-fullstack", title: "면접", characters: [{ id: "c", name: "면접관" }], episodes: [{ id: 1, character_id: "c", modes: [5] }] };
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body = pathname.endsWith("/health") ? { dialogue_provider: "openai", dialogue_ready: true, tts_ready: false }
      : pathname.endsWith("/scenarios") ? [scenario]
      : pathname.endsWith("/sessions/21") ? { id: 21, status: "in_progress", mode: 5, scenario,
        current_turn: { id: 31, order: 1, episode_id: 1, character_id: "c", question_text: "자기소개해 주세요." },
        history: [], voice_analysis: { engine_version: "voice-measure-v2", calibration: null } } : {};
    if (pathname.endsWith("/voice/calibration") && route.request().method() === "POST") {
      calibrationRequests++;
      const raw = route.request().postDataBuffer().toString();
      const match = raw.match(/name="capture"\r\n\r\n([^\r]+)/);
      assert.ok(match, "actual multipart request includes capture settings");
      const capture = JSON.parse(match[1]);
      assert.equal(capture.auto_gain_control, false);
      body = { id: "cal-1", status: "measured", reference_rms: .07, capture };
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(url);
  const dialog = page.getByRole("dialog", { name: "내 목소리의 기준을 확인해요" });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => window.__speeches), 0);
  await page.getByRole("button", { name: "마이크 확인 시작", exact: true }).click();
  await page.getByRole("button", { name: "문장 읽기 시작", exact: true }).click({ timeout: 8000 });
  await dialog.waitFor({ state: "hidden", timeout: 20_000 });
  assert.equal(calibrationRequests, 1);
  await page.waitForFunction(() => window.__speeches > 0);
  await page.evaluate(() => { window.__micSettings.deviceId = "changed-mic"; });
  await dialog.waitFor({ timeout: 5000 });
  await mkdir("../.omo/evidence/voice-v2", { recursive: true });
  await page.screenshot({ path: "../.omo/evidence/voice-v2/calibration-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../.omo/evidence/voice-v2/calibration-mobile.png" });
  const box = await dialog.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.getByRole("button", { name: "목소리 분석 없이 연습" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
});

test("voice report displays raw and reference values without a fabricated voice score", { timeout: 30_000 }, async (t) => {
  const { server, url } = await startVite();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 21, access_token: "test-token" })));
  const metric = (fields) => ({ status: "measured", ...fields });
  const report = { session_id: 21, total_score: 75, fit_scores: { voice: { score: null } },
    speech_stats: { voice_analysis: { engine_version: "voice-measure-v2", turns: [{ turn_id: 31, duration_sec: 8,
      volume: metric({ relative_db: -6.02 }), speed: metric({ syllables_per_second: 4.6 }),
      pauses: metric({ count: 1, segments: [{ id: "p1", start: 3, end: 4, duration_sec: 1 }] }),
      pitch: metric({ median_hz: 180, p10_hz: 170, p90_hz: 200, track: [{ time: 1, hz: 170 }, { time: 2, hz: 180 }, { time: 5, hz: 200 }] }),
      voice_irregularity: metric({ segments: [{ start: 1, end: 3, jitter_local_pct: .1, shimmer_local_pct: 2 }] }),
    }] } } };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/sessions/21") ? { id: 21, status: "completed", scenario: {} }
      : pathname.endsWith("/progress") ? { stage: "done", pct: 100, status: "completed" }
      : pathname.endsWith("/report") ? report
      : pathname.endsWith("/scenarios") || pathname.endsWith("/history") ? [] : {};
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(url);
  await page.getByText("1번째 답변의 측정값", { exact: true }).click();
  const section = page.locator(".voice-report");
  assert.match(await section.innerText(), /-6.02dB/);
  assert.match(await section.innerText(), /4.60음절/);
  assert.match(await section.innerText(), /jitter 0.10%/);
  assert.equal(await section.locator("circle").count(), 3);
  await page.getByText("측정 기록 제공 · 점수 보류", { exact: true }).waitFor();
  await section.screenshot({ path: "../.omo/evidence/voice-v2/report-mobile.png" });
  const box = await section.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  assert.deepEqual(errors, []);
});
