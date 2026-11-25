import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

describe("tracking overlay departure and reacquisition", { concurrency: false }, () => {
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
        const points = (length, width, height) => Array.from({ length }, (_, i) => ({
          x: window.tracking.center + Math.cos(i * Math.PI * 2 / length) * width,
          y: .45 + Math.sin(i * Math.PI * 2 / length) * height, z: 0, visibility: 1,
        }));
        export const PoseLandmarker = { createFromOptions: async () => ({ close() {}, detectForVideo() {
          const c = window.tracking; c.calls.pose++;
          if (c.poseError) throw new Error('temporary pose failure');
          const p = points(33, .1, .2);
          p[0] = {x:c.center,y:.4,z:0,visibility:1};
          p[11].x = c.center - .08; p[12].x = c.center + .08;
          return { landmarks: c.person ? [p] : [] };
        } }) };
        export const HandLandmarker = { createFromOptions: async () => ({ close() {}, detectForVideo: () => ({ landmarks: [] }) }) };
        export const FaceLandmarker = { createFromOptions: async () => ({ close() {}, detectForVideo(input) {
          const c = window.tracking; c.calls.face++;
          if (c.faceError) throw new Error('temporary face failure');
          const facePoints = input.width === 384 ? Array.from({length:468}, (_,i) => ({x:.5+Math.cos(i*Math.PI*2/468)*.26,y:.55+Math.sin(i*Math.PI*2/468)*.3,z:0})) : points(468,.07,.09);
          return { faceLandmarks: c.face ? [facePoints] : [] };
        } }) };
      `,
    }));
    await page.route("**/node_modules/.vite/deps/onnxruntime-web_wasm.js*", route => route.fulfill({
      contentType: "text/javascript", body: `
        export const env = { wasm: {} };
        export class Tensor {}
        export const InferenceSession = { create: async () => ({ release: async () => {}, async run() {
          const c = window.tracking; c.calls.expression++;
          if (c.holdExpression) await new Promise(resolve => c.pending.push(resolve));
          return { logits: { data: [2, 0, 0, 0, 0, 0, 0] } };
        } }) };
      `,
    }));
    await page.route("**/tracking-reacquisition-harness", route => route.fulfill({ contentType: "text/html",
      body: '<div id="root"></div><script type="module" src="/src/lib/__fixtures__/trackingReacquisition.js"></script>' }));
    await page.clock.install();
    await page.goto(`${url}tracking-reacquisition-harness`);
    await page.waitForFunction(() => tracking.live?.status === "ready" && tracking.live.expression !== "loading");
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.clock.runFor(2400);
    assert.ok((await page.evaluate(() => tracking.pixels())).count > 0);
    return page;
  }

  async function expectEmpty(page) {
    assert.deepEqual(await page.evaluate(() => tracking.pixels()), { count: 0, center: null });
    assert.equal(await page.evaluate(() => tracking.live.tracking), false);
  }

  async function expectReacquired(page) {
    await page.evaluate(() => { tracking.person = tracking.face = true; tracking.center = .51; });
    await page.clock.runFor(800);
    const pixels = await page.evaluate(() => tracking.pixels());
    assert.ok(pixels.count > 0);
    assert.ok(pixels.center > .45, `overlay follows the new position: ${pixels.center}`);
    assert.equal(await page.evaluate(() => tracking.live.tracking), true);
  }

  test("departure clears dots and lines while expression is pending; return draws the new position", async t => {
    const page = await open(t);
    assert.equal(await page.evaluate(() => tracking.pending.length), 1);
    const calls = await page.evaluate(() => tracking.calls.pose);
    await page.evaluate(() => { tracking.person = tracking.face = false; });
    await page.clock.runFor(400);
    await expectEmpty(page);
    assert.ok(await page.evaluate(previous => tracking.calls.pose > previous, calls), "pose detection keeps running during ONNX");
    await page.evaluate(() => { tracking.holdExpression = false; tracking.pending.splice(0).forEach(resolve => resolve()); });
    await page.clock.runFor(1);
    assert.equal(await page.evaluate(() => tracking.stats().expression_model), null, "late output from a departed person is discarded");
    await expectReacquired(page);
    await page.clock.runFor(1_200);
    assert.ok(await page.evaluate(() => tracking.stats().expression_model.samples > 0), "expression sampling also resumes for the returning person");
  });

  test("does not switch to an unassociated face when the locked body disappears", async t => {
    const page = await open(t);
    await page.evaluate(() => { tracking.person = false; tracking.center = .8; });
    await page.clock.runFor(400);
    await expectEmpty(page);
    await page.evaluate(() => { tracking.person = true; tracking.center = .51; });
    await page.clock.runFor(800);
    assert.ok((await page.evaluate(() => tracking.pixels())).count > 0);
  });

  for (const failure of ["frozen", "frameReady", "inference"]) {
    test(`${failure} clears stale overlays and resumes on fresh frames`, async t => {
      const page = await open(t);
      await page.evaluate(failure => {
        if (failure === "inference") tracking.poseError = tracking.faceError = true;
        else tracking[failure] = failure === "frozen";
      }, failure);
      await page.clock.runFor(800);
      await expectEmpty(page);
      await page.evaluate(() => { tracking.frozen = tracking.poseError = tracking.faceError = false; tracking.frameReady = true; });
      await expectReacquired(page);
    });
  }
});
