import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

describe("mirror visitor media inactivity", { concurrency: false }, () => {
  let server, url, browser;
  test.before(async () => {
    ({ server, url } = await startVite());
    browser = await chromium.launch({ channel: "chrome", headless: true });
  });
  test.after(async () => { await browser?.close(); await server?.close(); });

  async function open(t) {
    const page = await browser.newPage();
    t.after(() => page.close());
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await page.route("**/node_modules/.vite/deps/@mediapipe_tasks-vision.js*", route => route.fulfill({
      contentType: "text/javascript", body: `
        export const FilesetResolver = { forVisionTasks: async () => ({}) };
        const points = () => Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
        export const PoseLandmarker = { createFromOptions: async () => ({ close() {},
          detectForVideo: () => ({ landmarks: window.visitor.person ? [points()] : [] }) }) };
        export const HandLandmarker = { createFromOptions: async () => ({ close() {}, detectForVideo: () => ({ landmarks: [] }) }) };
        export const FaceLandmarker = { createFromOptions: async () => ({ close() {},
          detectForVideo: () => ({ faceLandmarks: window.visitor.face ? [points()] : [] }) }) };
      `,
    }));
    await page.route("**/node_modules/.vite/deps/onnxruntime-web_wasm.js*", route => route.fulfill({
      contentType: "text/javascript", body: `export const env = { wasm: {} }; export const InferenceSession = { create: async () => ({ release: async () => {} }) };`,
    }));
    await page.route("**/visitor-idle-harness", route => route.fulfill({ contentType: "text/html",
      body: '<div id="root"></div><script type="module" src="/src/lib/__fixtures__/mirrorVisitorIdle.js"></script>' }));
    await page.clock.install();
    await page.goto(`${url}visitor-idle-harness`);
    await page.waitForFunction(() => visitor.ready && visitor.expression !== "loading");
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.evaluate(() => visitor.markActivity());
    return page;
  }

  test("no voice or person returns once at 30 seconds; low background noise does not extend it", async t => {
    const page = await open(t);
    await page.evaluate(() => { visitor.voice = 0.003; });
    await page.clock.fastForward(29_800);
    assert.equal(await page.evaluate(() => visitor.returns), 0);
    await page.clock.fastForward(300);
    assert.equal(await page.evaluate(() => visitor.returns), 1);
    await page.clock.fastForward(30_000);
    assert.equal(await page.evaluate(() => visitor.returns), 1);
  });

  for (const input of ["person", "face", "voice"]) {
    test(`${input} alone keeps the screen; departure starts a fresh 30-second wait`, async t => {
      const page = await open(t);
      await page.evaluate(input => { visitor[input] = input === "voice" ? 0.1 : true; }, input);
      await page.clock.runFor(1_000);
      for (let i = 0; i < 4; i++) await page.clock.fastForward(10_000);
      assert.equal(await page.evaluate(() => visitor.returns), 0);
      await page.evaluate(input => { visitor[input] = input === "voice" ? 0 : false; }, input);
      await page.clock.fastForward(28_800);
      assert.equal(await page.evaluate(() => visitor.returns), 0);
      await page.clock.fastForward(1_500);
      assert.equal(await page.evaluate(() => visitor.returns), 1);
    });
  }

  test("frozen camera frames do not count as a present visitor", async t => {
    const page = await open(t);
    await page.evaluate(() => { visitor.person = true; });
    await page.clock.runFor(2_000);
    await page.evaluate(() => { visitor.frozen = true; });
    await page.clock.runFor(200);
    await page.clock.fastForward(30_300);
    assert.equal(await page.evaluate(() => visitor.returns), 1);
  });

  test("TTS/server waiting pauses the timer and receives a full 30 seconds afterwards", async t => {
    const page = await open(t);
    await page.clock.fastForward(20_000);
    await page.evaluate(() => visitor.pause(true));
    await page.clock.fastForward(60_000);
    assert.equal(await page.evaluate(() => visitor.returns), 0);
    await page.evaluate(() => visitor.pause(false));
    await page.clock.fastForward(29_800);
    assert.equal(await page.evaluate(() => visitor.returns), 0);
    await page.clock.fastForward(300);
    assert.equal(await page.evaluate(() => visitor.returns), 1);
  });

  test("disabling and unmounting release the audio observer and cancel timeout", async t => {
    const page = await open(t);
    await page.evaluate(() => visitor.disable());
    await page.waitForFunction(() => visitor.closed === 1);
    await page.clock.fastForward(40_000);
    assert.equal(await page.evaluate(() => visitor.returns), 0);
    await page.evaluate(() => visitor.unmount());
    await page.clock.fastForward(40_000);
    assert.equal(await page.evaluate(() => visitor.returns), 0);
  });
});
