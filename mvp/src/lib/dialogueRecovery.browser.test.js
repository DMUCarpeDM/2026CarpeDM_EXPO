import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("input and dialogue failures restart capture without repeating TTS or advancing the turn", { timeout: 45000 }, async t => {
  const { server, url } = await startVite();
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--mute-audio"] });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ permissions: ["camera", "microphone"] });
  await context.addInitScript(() => {
    localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 21, access_token: "test-token" }));
    window.__spoken = []; window.__recordingStarts = 0;
    const Recorder = window.MediaRecorder;
    window.MediaRecorder = class extends Recorder {
      start(...args) { window.__recordingStarts++; super.start(...args); }
    };
    window.SpeechRecognition = class {
      start() { window.__recognition = this; this.onstart?.(); }
      abort() {}
    };
    Object.defineProperty(speechSynthesis, "speak", { value: utterance => {
      window.__spoken.push(utterance.text); utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 10);
    } });
  });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const scenario = { slug: "training", title: "대화 연습", characters: [{ id: "c", name: "상대" }], episodes: [] };
  const turn = { id: 31, order: 1, question_text: "자료를 확인해 주세요.", character_id: "c", episode_id: 1 };
  const submitted = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body = {}, status = 200;
    if (path.endsWith("/health")) body = { dialogue_ready: true, tts_ready: false };
    else if (path.endsWith("/scenarios")) body = [scenario];
    else if (path.endsWith("/sessions/21")) body = { id: 21, status: "in_progress", mode: 5, scenario, current_turn: turn, history: [] };
    else if (path.endsWith("/response")) {
      submitted.push({ path, text: route.request().postDataJSON().text });
      status = submitted.length === 1 ? 422 : submitted.length === 2 ? 503 : 200;
      body = status === 200 ? { finished: false, next_turn: { ...turn, id: 32, question_text: "그 순서대로 확인해요." } }
        : { detail: status === 422 ? "답변을 인식하지 못했어요. 다시 말해 주세요." : "대화를 생성하지 못했어요. 잠시 후 다시 답변해 주세요." };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(url);
  await page.locator(".practice-screen").waitFor();
  await page.waitForFunction(() => window.__recognition?.onresult && window.__recordingStarts > 0);
  for (const [index, answer] of ["null", "자료를 읽겠습니다.", "모르는 부분을 정리하겠습니다."].entries()) {
    const before = await page.evaluate(() => ({ recordings: window.__recordingStarts, spoken: window.__spoken.length }));
    await page.evaluate(text => {
      const result = [{ transcript: text }]; result.isFinal = true;
      window.__recognition.onresult({ resultIndex: 0, results: [result] });
    }, answer);
    await page.waitForFunction(n => window.__recordingStarts > n, before.recordings);
    await page.waitForFunction(() => Boolean(window.__recognition?.onresult));
    assert.equal(submitted[index].text, answer);
    assert.equal(submitted[index].path, "/api/sessions/21/turns/31/response");
    if (index < 2) {
      assert.equal(await page.locator("#practice-question").textContent(), turn.question_text);
      assert.equal(await page.evaluate(() => window.__spoken.length), before.spoken);
    }
  }
  await page.waitForFunction(() => document.querySelector("#practice-question")?.textContent === "그 순서대로 확인해요.");
  assert.deepEqual(errors, []);
});
