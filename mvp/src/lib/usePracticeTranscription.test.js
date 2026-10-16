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
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.clock.runFor(1100);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["첫 답변"]);
    assert.equal(await page.evaluate(() => stt.current.getSttSource()), "webspeech");
    await page.evaluate(() => { stt.recognitions.at(-1).result("계속"); stt.recognitions.at(-1).result("말하는 중", false); });
    await page.waitForFunction(() => stt.current.interim === "말하는 중");
    await page.clock.runFor(3000);
    assert.equal(await page.evaluate(() => stt.submissions.length), 1);
    await page.evaluate(() => { stt.recognitions.at(-1).result("끝"); stt.type("수동 수정"); });
    await page.clock.runFor(3000);
    assert.equal(await page.evaluate(() => stt.submissions.length), 1);
  });

  test("records native speech-end to final latency without stopping recognition or submitting interim text", async (t) => {
    const page = await open(t);
    await page.evaluate(() => {
      stt.recognitions.at(-1).onspeechstart();
      stt.recognitions.at(-1).result("임시 답변", false);
      stt.recognitions.at(-1).onspeechend();
    });
    await page.clock.runFor(1200);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).stops), 0);
    await page.evaluate(() => stt.recognitions.at(-1).result("실제 확정 답변"));
    await page.waitForFunction(() => stt.current.draft === "실제 확정 답변");
    await page.clock.runFor(750);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.clock.runFor(100);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["실제 확정 답변"]);
    const timings = await page.evaluate(() => window.__mirrorSpeechTimings);
    const final = timings.find(item => item.event === "final");
    assert.equal(final.endToFinalMs, Math.round(final.finalAtMs - final.speechEndAtMs));
    assert.ok(final.endToFinalMs >= 1200 && final.endToFinalMs < 1250);
    const submitted = timings.find(item => item.event === "auto-submit");
    assert.ok(submitted.atMs - submitted.speechEndAtMs >= 2000);
    assert.ok(submitted.atMs - submitted.speechEndAtMs < 2050);
    assert.ok(submitted.finalToSubmitMs < 1000, "finalization time counts toward the silence window");
    assert.equal(JSON.stringify(timings).includes("실제 확정 답변"), false);
  });

  test("speaking again within two seconds restarts the silence window and keeps the complete answer", async t => {
    const page = await open(t);
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).continuous), true);
    await page.evaluate(() => {
      const recognition = stt.recognitions.at(-1);
      recognition.onspeechstart(); recognition.onspeechend(); recognition.result("첫 문장입니다.");
    });
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.evaluate(() => {
      const recognition = stt.recognitions.at(-1);
      recognition.onspeechstart(); recognition.result("이어서 말하는 중", false);
    });
    await page.clock.runFor(2500);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.evaluate(() => {
      const recognition = stt.recognitions.at(-1);
      recognition.onspeechend(); recognition.result("이어서 답변합니다.");
    });
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.clock.runFor(1100);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["첫 문장입니다. 이어서 답변합니다."]);
  });

  test("separate final segments are combined and each segment resets the two-second deadline", async t => {
    const page = await open(t);
    await page.evaluate(() => {
      const recognition = stt.recognitions.at(-1);
      recognition.onspeechend(); recognition.result("첫 번째 문장.");
    });
    await page.clock.runFor(1000);
    await page.evaluate(() => stt.recognitions.at(-1).result("두 번째 문장."));
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.clock.runFor(1100);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["첫 번째 문장. 두 번째 문장."]);
  });

  test("manual simulation accumulates final and interim speech until Enter, even without speechend", async (t) => {
    const page = await open(t, "?manual");
    await page.evaluate(() => stt.recognitions.at(-1).result("제 소비는"));
    await page.waitForFunction(() => stt.current.draft === "제 소비는");
    await page.evaluate(() => stt.recognitions.at(-1).result("제가 정할게요", false));
    await page.waitForFunction(() => stt.current.interim === "제가 정할게요");
    await page.clock.runFor(10_000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.locator("#practice-answer").focus();
    await page.keyboard.press("Shift+Enter");
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true })));
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["제 소비는 제가 정할게요"]);
    assert.equal(await page.evaluate(() => stt.sources), "webspeech");
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).aborts), 1);
  });

  test("manual Enter works from the mirror background but respects pause, AI speech and controls", async (t) => {
    const page = await open(t, "?manual");
    await page.evaluate(() => stt.type("수동 답변"));
    await page.waitForFunction(() => stt.current.draft === "수동 답변");
    await page.getByRole("button", { name: "Retry", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    for (const key of ["paused", "busy", "aiSpeaking"]) {
      await page.evaluate(key => stt.update({ [key]: true }), key);
      await page.waitForFunction(() => !stt.current.listening);
      await page.evaluate(() => document.activeElement.blur());
      await page.keyboard.press("Enter");
      assert.deepEqual(await page.evaluate(() => stt.submissions), []);
      await page.evaluate(key => stt.update({ [key]: false }), key);
      await page.waitForFunction(() => stt.current.listening);
    }
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["수동 답변"]);
  });

  test("single-shot recognition ends once, preserves the answer for Enter and resumes after AI speech", async (t) => {
    const page = await open(t, "?manual");
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).continuous), false);
    await page.evaluate(() => {
      const recognition = stt.recognitions.at(-1);
      recognition.result("한 번 인식한 답변");
      recognition.onend();
    });
    await page.waitForFunction(() => !stt.current.listening && stt.current.draft === "한 번 인식한 답변");
    await page.clock.runFor(5000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    assert.equal(await page.evaluate(() => stt.recognitions.length), 1);
    assert.equal(await page.evaluate(() => stt.recognitions[0].starts), 1);
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["한 번 인식한 답변"]);
    await page.evaluate(() => stt.playback(true));
    await page.evaluate(() => stt.playback(false));
    await page.waitForFunction(() => stt.current.listening && stt.recognitions.length === 2);
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).continuous), false);
  });

  test("AI completion requests recognition immediately and measures engine startup separately", async (t) => {
    const page = await open(t, "?manual");
    await page.evaluate(() => stt.playback(true));
    await page.waitForFunction(() => !stt.current.listening);
    await page.evaluate(() => stt.playback(false));
    // No clock advance: restart must not require a two- or three-second timer.
    await page.waitForFunction(() => stt.current.listening && stt.recognitions.length === 2);
    const timing = await page.evaluate(() => window.__mirrorSpeechTimings.filter(row => row.event === "listening").at(-1));
    assert.ok(timing.resumeToStartMs >= 0 && timing.resumeToStartMs < 100);
    assert.ok(timing.browserStartupMs >= 0 && timing.browserStartupMs < 50);
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

  test("TTS aborts immediately, ignores queued and stale results, then resumes without losing the draft", { timeout: 30_000 }, async (t) => {
    const page = await open(t);
    await page.waitForFunction(() => stt.current.listening);
    await page.evaluate(() => {
      const old = stt.recognitions.at(-1);
      const result = old.onresult;
      const end = old.onend;
      stt.lateResult = () => {
        const item = [{ transcript: "스피커에서 들린 AI 질문" }]; item.isFinal = true;
        result({ resultIndex: 0, results: [item] });
      };
      stt.lateEnd = () => end();
      old.result("기존 답변");
      stt.playback(true);
      stt.lateResult();
      stt.lateEnd();
    });
    await page.waitForFunction(() => !stt.current.listening);
    assert.equal(await page.evaluate(() => stt.recognitions[0].aborts > 0), true);
    assert.equal(await page.evaluate(() => stt.current.draft), "기존 답변");
    await page.clock.runFor(5000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    assert.equal(await page.evaluate(() => stt.recognitions.length), 1);
    await page.evaluate(() => stt.playback(false));
    await page.waitForFunction(() => stt.current.listening);
    await page.evaluate(() => { stt.lateResult(); stt.lateEnd(); stt.recognitions.at(-1).result("새 답변"); });
    await page.waitForFunction(() => stt.current.draft === "기존 답변 새 답변");
    assert.equal(await page.evaluate(() => stt.current.listening), true);
    await page.clock.runFor(3000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["기존 답변 새 답변"]);
    const prior = await page.evaluate(() => stt.recognitions.length);
    // Unsupported or immediately failed TTS can start and finish in one React batch.
    await page.evaluate(() => { stt.playback(true); stt.playback(false); });
    await page.waitForFunction(prior => stt.current.listening && stt.recognitions.length > prior, prior);
    await page.evaluate(() => stt.current.setMicEnabled(false));
    await page.waitForFunction(() => !stt.current.listening);
    const count = await page.evaluate(() => stt.recognitions.length);
    await page.evaluate(() => stt.playback(true));
    await page.evaluate(() => stt.playback(false));
    await page.clock.runFor(1000);
    assert.equal(await page.evaluate(() => stt.recognitions.length), count);
  });

  test("unfinalized captions survive recognition end and can be sent with Enter", async (t) => {
    const page = await open(t, "?manual");
    await page.evaluate(() => stt.recognitions.at(-1).result("아직 확정되지 않은 답변", false));
    await page.waitForFunction(() => stt.current.interim !== "");
    await page.evaluate(() => stt.recognitions.at(-1).onend());
    await page.waitForFunction(() => !stt.current.listening);
    assert.equal(await page.evaluate(() => stt.current.interim), "아직 확정되지 않은 답변");
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["아직 확정되지 않은 답변"]);
  });

  test("refreshing the same turn object does not abort active recognition", async (t) => {
    const page = await open(t, "?manual");
    await page.evaluate(() => stt.recognitions.at(-1).result("말하는 중", false));
    await page.waitForFunction(() => stt.current.interim !== "");
    const count = await page.evaluate(() => stt.recognitions.length);
    await page.evaluate(() => stt.update({ turn: { id: 1 } }));
    await page.clock.runFor(100);
    assert.equal(await page.evaluate(() => stt.recognitions.length), count);
    assert.equal(await page.evaluate(() => stt.current.interim), "말하는 중");
  });

  test("failed recognition start reports an error and retry restores the next turn", async (t) => {
    const page = await open(t, "?manual");
    await page.evaluate(() => stt.playback(true));
    await page.waitForFunction(() => !stt.current.listening);
    await page.evaluate(() => { stt.failStart = true; stt.playback(false); });
    await page.waitForFunction(() => stt.current.recognitionError === "audio-capture");
    assert.equal(await page.evaluate(() => stt.current.listening), false);
    await page.evaluate(() => { stt.failStart = false; stt.current.retryBrowserRecognition(); });
    await page.waitForFunction(() => stt.current.listening);
    await page.evaluate(() => stt.recognitions.at(-1).result("두 번째 답변"));
    await page.waitForFunction(() => stt.current.draft === "두 번째 답변");
  });

  test("normal recognition end sends interim-only speech without Enter exactly once", async t => {
    const page = await open(t);
    await page.evaluate(() => stt.recognitions.at(-1).result("전체 음성 답변", false));
    await page.waitForFunction(() => stt.current.interim !== "");
    await page.evaluate(() => stt.recognitions.at(-1).onend());
    await page.clock.runFor(2000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["전체 음성 답변"]);
    await page.evaluate(() => stt.recognitions.at(-1).onend());
    await page.clock.runFor(2000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["전체 음성 답변"]);
  });

  test("recognition errors do not send unfinished speech", async t => {
    const page = await open(t);
    await page.evaluate(() => stt.recognitions.at(-1).result("불확실한 답변", false));
    await page.waitForFunction(() => stt.current.interim !== "");
    await page.evaluate(() => { const r=stt.recognitions.at(-1); r.onerror({error:"no-speech"}); r.onend(); });
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
  });

  test("empty and no-speech ends resume on the selected audio track until an answer arrives", async t => {
    const page = await open(t);
    for (const error of [null, "no-speech", "no-speech"]) {
      const count = await page.evaluate(() => stt.recognitions.length);
      await page.evaluate(error => {
        const recognition = stt.recognitions.at(-1);
        if (error) recognition.onerror({ error });
        recognition.onend();
        recognition.onend();
      }, error);
      await page.clock.runFor(300);
      assert.equal(await page.evaluate(() => stt.recognitions.length), count + 1);
      assert.equal(await page.evaluate(() => stt.current.listening), true);
      assert.equal(await page.evaluate(() => stt.current.recognitionError), null);
      assert.equal(await page.evaluate(() => stt.recognitions.at(-1).track === stt.recognitions[0].track), true);
      assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    }
    await page.evaluate(() => stt.recognitions.at(-1).result("잠시 생각한 뒤 말한 답변"));
    await page.clock.runFor(2100);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["잠시 생각한 뒤 말한 답변"]);
  });

  test("silence recovery is cancelled by AI speech, pause, overlay, mic disable and unmount", async t => {
    for (const change of ["aiSpeaking", "paused", "busy", "entryOverlayOpen", "mic", "unmount"]) {
      const page = await open(t);
      await page.evaluate(change => {
        const recognition = stt.recognitions.at(-1);
        recognition.onerror({ error: "no-speech" });
        recognition.onend();
        if (change === "mic") stt.current.setMicEnabled(false);
        else if (change === "unmount") stt.unmount();
        else if (change === "aiSpeaking") stt.playback(true);
        else stt.update({ [change]: true });
      }, change);
      await page.clock.runFor(2000);
      assert.equal(await page.evaluate(() => stt.recognitions.length), 1, change);
      assert.deepEqual(await page.evaluate(() => stt.submissions), [], change);
    }
  });

  test("permission failure stops recognition without calling server STT", { timeout: 30_000 }, async (t) => {
    const page = await open(t);
    await page.evaluate(() => {
      stt.recognitions.at(-1).result("음성 답변");
      stt.recognitions.at(-1).onerror({ error: "not-allowed" });
    });
    await page.waitForFunction(() => stt.current.sttMode === "off" && !stt.current.listening);
    await page.clock.runFor(6400);
    assert.equal(await page.evaluate(() => stt.requests.length), 0);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    assert.equal(await page.evaluate(() => stt.current.draft), "음성 답변");
  });

  test("network errors retry three times, then allow manual recovery", { timeout: 30_000 }, async (t) => {
    const page = await open(t);
    for (const delay of [1000, 2000, 4000]) {
      const count = await page.evaluate(() => stt.recognitions.length);
      await page.evaluate(() => stt.recognitions.at(-1).onerror({ error: "network" }));
      await page.clock.runFor(delay);
      await page.waitForFunction(count => stt.recognitions.length > count && stt.current.listening, count);
    }
    await page.evaluate(() => stt.recognitions.at(-1).onerror({ error: "network" }));
    await page.waitForFunction(() => stt.current.sttMode === "off");
    await page.evaluate(() => stt.current.retryBrowserRecognition());
    await page.waitForFunction(() => stt.current.listening);
    await page.evaluate(() => stt.recognitions.at(-1).result("복구 후 답변"));
    await page.clock.runFor(3000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["복구 후 답변"]);
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

  test("mic disable, entry overlay and turn change cancel pending answers", { timeout: 30_000 }, async (t) => {
    const page = await open(t);
    await page.evaluate(() => { stt.recognitions.at(-1).result("이전 답변"); stt.current.setMicEnabled(false); });
    await page.waitForFunction(() => !stt.current.listening);
    await page.clock.runFor(3000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.evaluate(() => stt.current.setMicEnabled(true));
    await page.waitForFunction(() => stt.current.listening);
    await page.evaluate(() => { stt.recognitions.at(-1).result("이전 턴"); stt.update({ turn: { id: 2 } }); });
    await page.clock.runFor(3000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
    await page.evaluate(() => { stt.recognitions.at(-1).result("안내 전 답변"); stt.update({ entryOverlayOpen: true }); });
    await page.waitForFunction(() => !stt.current.listening);
    await page.clock.runFor(3000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), []);
  });

  test("unsupported audio track falls back to default microphone and resumes on request", { timeout: 30_000 }, async (t) => {
    const page = await open(t, "?trackUnsupported");
    await page.waitForFunction(() => stt.current.listening);
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).starts), 2);
    await page.evaluate(() => stt.recognitions.at(-1).onend());
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).starts), 2);
    await page.evaluate(() => stt.current.resumeBrowserRecognition());
    await page.waitForFunction(() => stt.recognitions.length === 2 && stt.current.listening);
    assert.equal(await page.evaluate(() => stt.recognitions.at(-1).starts), 2);
    await page.evaluate(() => stt.recognitions.at(-1).result("기본 마이크 답변"));
    await page.clock.runFor(3000);
    assert.deepEqual(await page.evaluate(() => stt.submissions), ["기본 마이크 답변"]);
  });

  test("synchronous microphone failure exposes recovery instead of waiting forever", { timeout: 30_000 }, async (t) => {
    const page = await open(t, "?startFailure");
    await page.waitForFunction(() => stt.current.sttMode === "off");
    assert.equal(await page.evaluate(() => stt.current.recognitionError), "not-allowed");
    assert.equal(await page.evaluate(() => stt.current.listening), false);
    assert.equal(await page.evaluate(() => stt.notes.length), 1);
  });
});
