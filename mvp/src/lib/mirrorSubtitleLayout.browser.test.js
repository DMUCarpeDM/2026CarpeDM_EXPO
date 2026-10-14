import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("mirror subtitles leave room for the live camera and bottom-right capture pill", { timeout: 90000 }, async t => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const pack = JSON.parse(await readFile(new URL("../../../poc/backend/app/seed/packs/workplace-conversation.json", import.meta.url)));
  const episode = pack.episodes[0];
  const image = await readFile(new URL("../assets/team-lead-video-portrait.png", import.meta.url));
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  await context.addInitScript(image => {
    localStorage.clear();
    localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 71, access_token: "layout-fixture" }));
    window.SpeechRecognition = class { start() { this.onstart?.(); } abort() {} };
    Object.defineProperty(speechSynthesis, "speak", { value: utterance => { window.__subtitleUtterance = utterance; } });
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.__layoutStream) return window.__layoutStream;
      const img = new Image(); img.src = "data:image/png;base64," + image; await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      canvas.getContext("2d").drawImage(img, 0, 0, 640, 480);
      window.__layoutStream = canvas.captureStream(10);
      const audio = new AudioContext(); const output = audio.createMediaStreamDestination();
      const oscillator = audio.createOscillator(); oscillator.connect(output); oscillator.start();
      window.__layoutStream.addTrack(output.stream.getAudioTracks()[0]);
      return window.__layoutStream;
    };
  }, image.toString("base64"));
  const page = await context.newPage();
  await page.clock.install();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/scenarios") ? [pack] : path.endsWith("/health") ? { dialogue_ready: false, tts_ready: false }
      : path.endsWith("/sessions/71") ? { id: 71, mode: 5, status: "in_progress", scenario: pack,
        current_turn: { id: 711, order: 1, character_id: episode.character_id, question_text: episode.initial_question }, history: [] } : {};
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  const out = "../.omo/evidence/selected-simulation-layout";
  await mkdir(out, { recursive: true });
  const observations = [];
  for (const viewport of [{ width: 1080, height: 1920 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: viewport.width === 390 ? "reduce" : "no-preference" });
    await page.goto(url + "?mirror=1&service=workplace");
    await page.locator(".simulation-dialogue-text").waitFor();
    await page.waitForFunction(() => Boolean(window.__subtitleUtterance));
    assert.equal(await page.locator(".simulation-dialogue-text").getAttribute("data-visible"), "false");
    await page.evaluate(() => { window.__subtitleUtterance.onstart(); window.__subtitleUtterance.onboundary({charIndex: 0}); });
    await page.waitForFunction(() => document.querySelector(".simulation-user-preview video")?.videoWidth > 0);
    await page.waitForFunction(() => [...document.querySelectorAll(".simulation-actor video")].every(video => video.readyState >= 2));
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".simulation-actor canvas");
      return canvas ? canvas.width > 300 : document.querySelector(".simulation-actor video")?.videoWidth > 300;
    });
    await page.locator(".simulation-actor video:not([aria-hidden='true'])").evaluate(async video => { video.currentTime = 2; await video.play(); });
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".simulation-dialogue-text > span").first().getAttribute("data-focus"), "active");
    assert.equal(await page.locator(".simulation-dialogue-text > span").count(), 1);
    await page.evaluate(() => window.__subtitleUtterance.onboundary({ charIndex: 3 }));
    assert.equal(await page.locator(".simulation-dialogue-text > span").first().getAttribute("data-tracking"), "true");
    assert.ok(Number(await page.locator(".simulation-dialogue-text > span").first().evaluate(el => el.style.getPropertyValue("--speech-progress"))) > 0);
    const metrics = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return { caption: box(".simulation-card-slot"), user: box(".simulation-user-preview"), pill: box(".mirror-capture-status"), frame: box(".mirror-scene-simulation"),
        glassCards: document.querySelectorAll(".simulation-card-slot .overview-summary-card").length,
        sentences: document.querySelectorAll(".simulation-dialogue-text > span").length };
    });
    assert.equal(metrics.glassCards, 0);
    assert.equal(metrics.sentences, 1);
    assert.ok(metrics.caption.right < metrics.user.left);
    assert.ok(metrics.user.bottom < metrics.pill.top);
    assert.ok(metrics.pill.bottom < metrics.frame.bottom);
    observations.push({ viewport, ...metrics });
    await page.screenshot({ path: `${out}/${viewport.width}.png` });
    await page.locator(".simulation-actor video:not([aria-hidden='true'])").evaluate(video => video.pause());
    await page.evaluate(() => window.__subtitleUtterance.onboundary({charIndex: window.__subtitleUtterance.text.indexOf(".") + 1}));
    assert.equal(await page.locator(".simulation-dialogue-text > span").first().getAttribute("data-focus"), "active");
    assert.equal(await page.locator(".simulation-dialogue-text > span").count(), 1);
    assert.equal(await page.locator(".simulation-dialogue-text > span").first().getAttribute("data-tracking"), "true");
    assert.equal(await page.locator(".simulation-card-slot").evaluate(el => getComputedStyle(el).overflowY), "visible");
    await page.clock.runFor(300);
    await page.screenshot({ path: `${out}/${viewport.width}-second-sentence.png` });
    if (viewport.width === 390) assert.equal(await page.locator(".simulation-dialogue-text").evaluate(el => getComputedStyle(el).transform), "none");
    await page.evaluate(() => window.__subtitleUtterance.onend());
    await page.clock.runFor(400);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".simulation-dialogue-text")).opacity) === 0);
  }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/verification.json`, JSON.stringify({ observations, camera: "synthetic local portrait fixture", errors }, null, 2));
});
