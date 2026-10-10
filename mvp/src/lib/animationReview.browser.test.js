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

test("reduced motion preserves mirror autoplay, explicit pause and resume", { timeout: 30000 }, async t => {
  const page = await open(t, "src/features/smart-mirror/previews/flow/index.html?backdrop=city", { reducedMotion: "reduce" });
  await page.locator('.mirror-overview[data-scene="0"]').waitFor();
  await page.clock.fastForward(11000);
  await page.locator('.mirror-overview[data-scene="1"]').waitFor();
  await page.getByRole("button", { name: "자동 안내 일시정지" }).click();
  await page.clock.fastForward(30000);
  assert.equal(await page.locator('.mirror-overview[data-scene="1"]').count(), 1);
  await page.getByRole("button", { name: "자동 안내 재개" }).click();
  await page.clock.fastForward(10000);
  await page.locator('.mirror-overview[data-scene="2"]').waitFor();
  const matrix = await page.locator(".overview-art img").last().evaluate(el => getComputedStyle(el).transform);
  assert.ok(matrix === "none" || matrix === "matrix(1, 0, 0, 1, 0, 0)", "reduced scene changes do not translate the illustration");
});

test("4K glass modal uses a short entrance and an opacity-only reduced alternative", { timeout: 30000 }, async t => {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const page = await open(t, "src/features/smart-mirror/previews/simulation/4k.html?scene=work&modal=preview", { reducedMotion });
    const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
    const card = frame.getByRole("dialog").locator(".overview-summary-card");
    await card.waitFor();
    const motion = await card.evaluate(el => ({
      name: getComputedStyle(el).animationName,
      duration: getComputedStyle(el).animationDuration,
      frames: el.getAnimations().flatMap(animation => animation.effect.getKeyframes()),
    }));
    assert.equal(motion.name, reducedMotion === "reduce" ? "mirror-modal-fade" : "mirror-modal-enter");
    assert.equal(motion.duration, reducedMotion === "reduce" ? "0.15s" : "0.22s");
    if (reducedMotion === "reduce") assert.equal(motion.frames.some(frame => "transform" in frame), false);
    assert.equal(await frame.locator(".simulation-dialogue").count(), 0);
  }
});

test("overview transitions never overlap character scenes and settle after rapid navigation", { timeout: 30000 }, async t => {
  // Real frames verify the exit/enter boundary; timer-driven tests use the virtual clock.
  const page = await open(t, "src/features/smart-mirror/previews/flow/index.html?backdrop=city", { reducedMotion: "no-preference", controlClock: false });
  await page.locator(".mirror-overview").waitFor();
  await page.getByRole("button", { name: "자동 안내 일시정지" }).click();
  await page.getByRole("button", { name: "다음 장면", exact: true }).click();
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(30);
    assert.equal(await page.locator(".overview-art img").count(), 1, "outgoing and incoming people never render together");
  }
  await page.getByRole("button", { name: "다음 장면", exact: true }).click();
  await page.getByRole("button", { name: "이전 장면", exact: true }).click();
  await page.waitForTimeout(120);
  await page.waitForFunction(() => {
    const image = document.querySelector(".overview-art img");
    return image?.alt === "책상 앞에서 업무를 확인하는 두 사람" && getComputedStyle(image).opacity === "1";
  });
  assert.equal(await page.locator(".overview-art img").count(), 1);
  assert.equal(await page.locator(".overview-art img").getAttribute("alt"), "책상 앞에서 업무를 확인하는 두 사람");
  assert.equal(await page.locator(".overview-art img").evaluate(el => getComputedStyle(el).opacity), "1");
});

test("slider progress fills with transform and its scene motion stays below 300ms", { timeout: 30000 }, async t => {
  const page = await open(t, "src/features/smart-mirror/previews/slider/index.html", { reducedMotion: "no-preference" });
  await page.locator('.scene-slider[data-scene="0"]').waitFor();
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
  await page.clock.runFor(300);
  await page.clock.fastForward(11800);
  await page.clock.runFor(180);
  await page.locator('.scene-slider[data-scene="1"]').waitFor();
  const progress = await page.locator(".slider-footer li.active i").evaluate(el => ({
    width: el.style.width, transform: el.style.transform, origin: getComputedStyle(el).transformOrigin,
  }));
  assert.equal(progress.width, "");
  assert.match(progress.transform, /^scaleX\(/);
  assert.match(progress.origin, /^0px/);
  const animations = await page.locator(".slider-scene").last().evaluate(el => el.getAnimations().map(animation => ({
    duration: animation.effect.getTiming().duration,
    properties: Object.keys(animation.effect.getKeyframes()[0]),
  })));
  assert.ok(animations.length > 0);
  for (const animation of animations) {
    assert.ok(animation.duration <= 280);
    assert.equal(animation.properties.some(property => ["width", "height", "left", "top"].includes(property)), false);
  }
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
