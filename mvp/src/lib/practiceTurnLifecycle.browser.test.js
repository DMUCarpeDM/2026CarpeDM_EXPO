import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

const harness = '<div id="root"></div><script type="module" src="/src/lib/__fixtures__/practiceTurnLifecycle.jsx"></script>';

async function open(t) {
  const { server, url } = await startVite();
  t.after(() => server.close());
  const html = await server.transformIndexHtml("/turn-lifecycle-harness", harness);
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [], responses = [], uploads = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  let releaseResponse;
  let holdResponse = false;
  await page.route("**/turn-lifecycle-harness*", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith("/tts")) return route.fulfill({ contentType: "audio/wav", headers: { "x-tts-provider": "elevenlabs" }, body: "test-audio" });
    let body = {};
    if (path.endsWith("/response")) {
      responses.push({ path, ...request.postDataJSON() });
      if (holdResponse) await new Promise(resolve => { releaseResponse = resolve; });
      body = { next_turn: { id: 101 + responses.length, order: 1 + responses.length, character_id: "c", question_text: responses.length === 1 ? "두 번째 질문입니다." : "세 번째 질문입니다." } };
    }
    if (path.endsWith("/audio")) {
      const data = request.postDataBuffer();
      const riff = data.indexOf(Buffer.from("RIFF"));
      assert.ok(riff >= 0, "recording upload contains a WAV");
      const voiceInput = JSON.parse(data.toString("utf8", 0, riff).match(/name="voice_input"\r\n\r\n([^\r]+)/)[1]);
      uploads.push({ path, voiceInput, sample: data.readInt16LE(riff + 44 + 1000) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`${url}turn-lifecycle-harness?mirror=1&service=workplace`);
  try {
    await page.waitForFunction(() => window.practice?.players.at(-1)?.onended && window.practice.recorders.at(-1)?.state === "recording", null, { timeout: 8000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 1200), players: window.practice?.players.length, recorders: window.practice?.recorders.map(recorder => recorder.state) }));
    throw new Error(JSON.stringify({ state, errors }), { cause: error });
  }
  return { page, responses, uploads, hold: () => { holdResponse = true; }, release: () => { holdResponse = false; releaseResponse?.(); } };
}

const finishAiSpeech = async page => {
  await page.evaluate(() => { practice.players.at(-1).playing=false; practice.players.at(-1).onended(); });
  await page.waitForFunction(() => Boolean(practice.recognitions.at(-1)?.onresult));
  await page.waitForFunction(() => practice.cues.length === practice.players.length, null, { timeout: 5000 });
};

test("mirror hides STT captions and still submits separate STT and recordings across three turns", { timeout: 45000 }, async t => {
  const fixture = await open(t), { page, responses, uploads } = fixture;
  t.after(fixture.release);
  assert.equal(await page.evaluate(() => practice.cues.length), 0, "no cue during AI speech");
  await finishAiSpeech(page);
  await page.evaluate(() => { const recognition=practice.recognitions.at(-1); recognition.onerror({error:"no-speech"}); recognition.onend(); });
  await page.waitForFunction(() => practice.recognitions.length > 1 && Boolean(practice.recognitions.at(-1).onresult));
  assert.equal(await page.evaluate(() => practice.cues.length), 1, "STT recovery does not repeat the turn's cue");
  fixture.hold();
  await page.evaluate(() => practice.recognitions.at(-1).result("첫 번째 사용자 답변", false));
  assert.equal(await page.locator(".simulation-answer").count(), 0, "interim STT stays hidden");
  await page.evaluate(() => practice.recognitions.at(-1).result("첫 번째 사용자 답변"));
  await page.waitForFunction(() => practice.recorders[0].state === "inactive");
  await page.waitForTimeout(100);
  assert.equal(responses.length, 1);
  assert.equal(await page.locator(".simulation-answer").count(), 0, "submitted captions clear while waiting for AI");
  fixture.release();
  await page.waitForFunction(() => practice.players.length === 2 && practice.players.at(-1).onended);
  assert.equal(await page.locator(".simulation-answer").count(), 0, "history is retained separately from current captions");
  assert.equal(await page.evaluate(() => practice.recognitions.at(-1).aborted), true);
  await finishAiSpeech(page);
  await page.evaluate(() => practice.recognitions.at(-1).result("두 번째 사용자 답변", false));
  assert.equal(await page.locator(".simulation-answer").count(), 0, "next-turn STT also stays hidden");
  await page.evaluate(() => practice.recognitions.at(-1).result("두 번째 사용자 답변"));
  await page.waitForFunction(() => practice.players.length === 3 && practice.players.at(-1).onended);
  await finishAiSpeech(page);
  await page.waitForFunction(() => practice.retained.length === 2);
  await page.waitForTimeout(100);
  assert.deepEqual(responses.map(response => response.text), ["첫 번째 사용자 답변", "두 번째 사용자 답변"]);
  assert.ok(responses.every(response => response.stt_source === "webspeech"));
  assert.deepEqual(responses.map(response => response.path), ["/api/sessions/91/turns/101/response", "/api/sessions/91/turns/102/response"]);
  assert.deepEqual(uploads.map(upload => upload.path).sort(), ["/api/sessions/91/turns/101/audio", "/api/sessions/91/turns/102/audio"]);
  assert.ok(uploads.every(upload => Math.abs(upload.sample - (upload.path.includes("/101/") ? 1000 : 2000)) < 2), JSON.stringify(uploads));
  assert.ok(uploads.every(upload => upload.voiceInput.capture?.device_id === "usb-test"));
  assert.ok(uploads.every(upload => upload.voiceInput.excluded_intervals.some(([start, end]) => start === 0 && end > start)), "AI speech is excluded from each turn's voice analysis");
  assert.equal(await page.evaluate(() => practice.recorders.length), 3, "each turn owns one recording");
  assert.equal(await page.evaluate(() => practice.recognitions.every(recognition => recognition.recordingReady)), true, "recording is ready before each STT start");
  assert.equal(await page.evaluate(() => practice.recognitions.every(recognition => recognition.track === practice.recorders[0].stream.getAudioTracks()[0])), true);
  assert.equal(await page.locator(".simulation-answer").count(), 0);
  assert.deepEqual(await page.evaluate(() => practice.cues), Array.from({length:3},()=>({recording:true,recognizing:true,aiPlaying:false})));
});

test("refreshing the same turn preserves its recorder and active transcription", { timeout: 30000 }, async t => {
  const { page } = await open(t);
  await finishAiSpeech(page);
  await page.evaluate(() => practice.recognitions.at(-1).result("이어서 말하는 답변", false));
  const before = await page.evaluate(() => ({ recorders: practice.recorders.length, recognitions: practice.recognitions.length }));
  await page.evaluate(() => practice.refreshTurn());
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => ({ recorders: practice.recorders.length, recognitions: practice.recognitions.length })), before);
  assert.equal(await page.locator(".simulation-answer").count(), 0, "same-turn refresh does not expose STT");
  assert.equal(await page.evaluate(() => practice.recorders.at(-1).state), "recording");
});
