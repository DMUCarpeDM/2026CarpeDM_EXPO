import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

describe("practice transcription lifecycle", { concurrency: false }, () => {
  let server, browser, url;
  test.before(async () => {
    ({ server, url } = await startVite());
    browser = await chromium.launch({ channel: "chrome", headless: true });
  });
  test.after(async () => { await browser?.close(); await server?.close(); });

  async function open(t, query = "") {
    const page = await browser.newPage();
    t.after(() => page.close());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await page.clock.install();
    await page.route("**/stt-harness*", (route) => route.fulfill({
      contentType: "text/html",
      body: '<div id="root"></div><script type="module" src="/src/lib/__fixtures__/practiceTranscription.js"></script>',
    }));
    await page.goto(`${url}stt-harness${query}`);
    await page.waitForFunction(() => window.stt?.current);
    return page;
  }

  test("final speech submits the latest draft; interim speech and typing cancel the timer", { timeout: 30_000 }, async (t) => {
    const page = await open(t);
    await page.evaluate(() => stt.recognitions.at(-1).result("첫 답변"));
    await page.waitForFunction(() => stt.current.draft === "첫 답변");
    await page.clock.runFor(2000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["첫 답변"]);
    assert.equal(await page.evaluate(() => stt.current.getSttSource()), "webspeech");
    await page.evaluate(() => stt.recognitions.at(-1).result("계속"));
    await page.evaluate(() => stt.recognitions.at(-1).result("말하는 중", false));
    await page.waitForFunction(() => stt.current.interim === "말하는 중");
    await page.clock.runFor(3000);
    assert.equal(await page.evaluate(() => stt.submissions.length), 1);
    await page.evaluate(() => stt.recognitions.at(-1).result("끝"));
    await page.evaluate(() => stt.type("수동 수정"));
    await page.clock.runFor(3000);
    assert.equal(await page.evaluate(() => stt.submissions.length), 1);
  });

  test("pause, AI speech, mic toggle, turn changes and unmount stop recognition", { timeout: 30_000 }, async (t) => {
    const page = await open(t);
    for (const key of ["paused", "aiSpeaking", "busy"]) {
      await page.evaluate((key) => { stt.recognitions.at(-1).result("답변"); stt.update({ [key]: true }); }, key);
      await page.waitForFunction(() => !stt.current.listening);
      assert.ok(await page.evaluate(() => stt.recognitions.at(-1).stops > 0));
      await page.clock.runFor(3000);
      assert.deepEqual(await page.evaluate(() => stt.submissions), []);
      await page.evaluate((key) => stt.update({ [key]: false }), key);
      await page.waitForFunction(() => stt.current.listening);
    }
    await page.evaluate(() => stt.current.setMicEnabled(false));
    await page.waitForFunction(() => !stt.current.listening);
    await page.evaluate(() => stt.current.setMicEnabled(true));
    await page.waitForFunction(() => stt.current.listening);
    const count = await page.evaluate(() => stt.recognitions.length);
    await page.evaluate(() => stt.update({ turn: { id: 2 } }));
    await page.waitForFunction((count) => stt.recognitions.length > count, count);
    assert.ok(await page.evaluate(() => stt.recognitions.at(-2).stops > 0));
    await page.evaluate(() => { stt.current.stopBrowserRecognition(); stt.current.resetSttUsage(); });
    assert.equal(await page.evaluate(() => stt.current.getSttSource()), "text");
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).starts), 1);
    await page.evaluate(() => stt.unmount());
    assert.ok(await page.evaluate(() => stt.recognitions.every((recognition) => recognition.stops > 0)));
  });

  test("browser failure falls back to Whisper; silence submits only a spoken draft and late results are ignored", { timeout: 30_000 }, async (t) => {
    const page = await open(t);
    await page.evaluate(() => {
      stt.type("직접 입력"); stt.voiced = false;
      stt.recognitions.at(-1).onerror({ error: "network" });
    });
    await page.waitForFunction(() => stt.current.sttMode === "server" && stt.current.listening);
    await page.clock.runFor(6400);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    assert.equal(await page.evaluate(() => stt.requests.length), 0);
    await page.evaluate(() => { stt.voiced = true; });
    await page.clock.runFor(3200);
    await page.waitForFunction(() => stt.requests.length === 1);
    await page.evaluate(() => stt.requests.shift()({ text: "음성 답변" }));
    await page.waitForFunction(() => stt.current.draft.includes("음성 답변"));
    assert.equal(await page.evaluate(() => stt.current.getSttSource()), "server-whisper");
    await page.evaluate(() => { stt.voiced = false; });
    await page.clock.runFor(3200);
    // WAV conversion and silence detection finish asynchronously before the 3-second timer.
    await page.waitForFunction(() => stt.recorders.length >= 5);
    await page.waitForTimeout(50);
    await page.clock.runFor(3000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["직접 입력 음성 답변"]);
    await page.evaluate(() => { stt.voiced = true; });
    await page.clock.runFor(3200);
    await page.waitForFunction(() => stt.requests.length > 0);
    await page.evaluate(() => stt.update({ paused: true }));
    await page.waitForFunction(() => !stt.current.listening);
    await page.evaluate(() => stt.requests.shift()({ text: "늦은 응답" }));
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => stt.current.draft), "직접 입력 음성 답변");
    await page.evaluate(() => stt.unmount());
    assert.ok(await page.evaluate(() => stt.recorders.every((recorder) => recorder.state === "inactive")));
  });

  test("without speech support, typed text remains available without auto submission", { timeout: 30_000 }, async (t) => {
    const page = await open(t, "?unsupported");
    await page.evaluate(() => stt.type("키보드 답변"));
    await page.waitForFunction(() => stt.current.draft === "키보드 답변");
    await page.clock.runFor(6400);
    assert.equal(await page.evaluate(() => stt.current.sttMode), "off");
    assert.equal(await page.evaluate(() => stt.current.getSttSource()), "text");
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
  });
});
