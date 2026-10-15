import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

let browser, server, url;
before(async () => {
  ({ server, url } = await startVite());
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

async function open(t, query, options = {}) {
  const { controlClock = true, ...browserOptions } = options;
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, ...browserOptions });
  t.after(() => context.close());
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  t.after(() => assert.deepEqual(errors, []));
  await context.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: new URL(route.request().url()).pathname.endsWith("/scenarios") ? "[]" : "{}" }));
  const page = await context.newPage();
  if (controlClock) await page.clock.install();
  await page.goto(`${url}${query}`);
  return page;
}

test("overview remains static while paused and resumes the short countdown", { timeout: 30000 }, async t => {
  const page = await open(t, "src/features/smart-mirror/previews/flow/index.html", { reducedMotion: "reduce" });
  await page.locator(".mirror-overview").waitFor();
  await page.getByRole("button", { name: "자동 안내 일시정지" }).click();
  const progress = page.getByRole("progressbar", { name: "대화 시작까지 진행" });
  const pausedValue = await progress.getAttribute("aria-valuenow");
  await page.clock.fastForward(30000);
  assert.equal(await progress.getAttribute("aria-valuenow"), pausedValue);
  assert.equal(await page.locator(".mirror-overview").count(), 1);
  assert.equal(await page.locator(".overview-steps").count(), 0);
  assert.equal(await page.locator(".overview-art img").evaluate(el => el.getAnimations().length), 0);
  await page.getByRole("button", { name: "자동 안내 재개" }).click();
  await page.clock.fastForward(5100);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
});
test("keyboard kiosk changes are immediate and repeated changes leave one stage", { timeout: 30000 }, async t => {
  const page = await open(t, "?service=workplace&kiosk=issue", { reducedMotion: "no-preference" });
  await page.locator('.kiosk-issue-screen[data-stage="select"]').waitFor();
  for (let i = 0; i < 3; i += 1) {
    await page.locator(".kiosk-role-card").first().focus();
    await page.keyboard.press("Enter");
    const consent = page.getByRole("region", { name: "체험 동의", exact: true });
    await consent.waitFor();
    assert.equal(await page.locator(".kiosk-issue-step").count(), 1);
    assert.equal(await consent.evaluate(el => getComputedStyle(el).transitionDuration), "0s");
    await page.getByRole("button", { name: "돌아가기", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.locator('.kiosk-issue-screen[data-stage="select"]').waitFor();
    assert.equal(await page.locator(".kiosk-issue-step").count(), 1);
  }
});

test("accordion rapidly retargets without height animations or stale open content", { timeout: 30000 }, async t => {
  const page = await open(t, "?service=training", { reducedMotion: "no-preference" });
  const trigger = page.locator(".ui-accordion__trigger").first();
  await trigger.scrollIntoViewIfNeeded();
  for (let i = 0; i < 4; i += 1) {
    await trigger.click();
    assert.equal(await trigger.getAttribute("data-state"), "open");
    assert.equal(await page.locator('.ui-accordion__content[data-state="open"]').evaluate(el => getComputedStyle(el).animationName), "none");
    await trigger.click();
    assert.equal(await trigger.getAttribute("data-state"), "closed");
    assert.equal(await page.locator('.ui-accordion__content[data-state="open"]').count(), 0);
  }
  await trigger.focus();
  await page.keyboard.press("Enter");
  assert.equal(await trigger.locator(".ui-accordion__chevron").evaluate(el => getComputedStyle(el).transitionDuration), "0s");
});

test("touch devices do not lift choice cards on synthetic hover", { timeout: 30000 }, async t => {
  const page = await open(t, "?service=workplace&kiosk=issue", { hasTouch: true, isMobile: true });
  assert.equal(await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches), false);
  const card = page.locator(".kiosk-role-card").first();
  await card.hover();
  assert.equal(await card.evaluate(el => el.matches(":hover")), true);
  const transform = await card.evaluate(el => getComputedStyle(el).transform);
  assert.equal(transform, "none");
});


test("single exhibition overview stays visible for twenty seconds", { timeout: 30000 }, async t => {
  const page = await open(t, "src/features/smart-mirror/previews/flow/index.html", { reducedMotion: "reduce" });
  await page.locator(".mirror-overview").waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.runFor(15000);
  assert.equal(await page.locator(".mirror-overview").count(), 1);
  await page.clock.runFor(4000);
  assert.equal(await page.locator(".mirror-overview").count(), 1);
  await page.clock.runFor(1200);
  await page.getByRole("region", { name: "직장 대화 시뮬레이션", exact: true }).waitFor();
});
