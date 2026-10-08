import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const artifacts = process.env.VISUAL_QA_ARTIFACTS || resolve(root, "../.omo/evidence/visual-readiness");
const observations = [];
const scenario = { slug: "workplace-conversation", title: "직장 대화", world_setting: { service_modes: ["workplace"] }, characters: [{ id: "boss", name: "김 팀장", role: "팀장" }], episodes: [{ id: 1, title: "일정 보고", character_id: "boss", modes: [5] }] };
const report = { session_id: 21, total_score: null, fit_scores: Object.fromEntries(["response", "voice", "expression", "posture"].map(key => [key, { score: null, summary: "자료가 없어 점수를 제공하지 않습니다." }])), strengths: [], improvements: [], speech_stats: {} };

async function start(staticDemo, dist) {
  if (dist) {
    const server = await preview({ root, logLevel: "error", build: { outDir: dist }, preview: { host: "127.0.0.1", port: 0 } });
    return { url: `http://127.0.0.1:${server.httpServer.address().port}/`, close: () => new Promise((done, reject) => server.httpServer.close(error => error ? reject(error) : done())) };
  }
  const server = await createServer({ root, logLevel: "error", define: { "import.meta.env.VITE_STATIC_DEMO": JSON.stringify(String(staticDemo)) }, server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  return { url: `http://127.0.0.1:${server.httpServer.address().port}/`, close: () => server.close() };
}

async function pageFor(browser, viewport, completed, mockApi = true) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  await context.addInitScript(({ mockApi }) => {
    localStorage.clear();
    if (mockApi) localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 21, access_token: "test-only" }));
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("QA physical media denied", "NotAllowedError"); };
    Object.defineProperty(speechSynthesis, "speak", { value: utterance => setTimeout(() => utterance.onend?.(), 5) });
  }, { mockApi });
  const page = await context.newPage();
  const errors = [], calls = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push({ path, method: route.request().method() });
    let body = {};
    if (path.endsWith("/health")) body = { dialogue_ready: false, tts_ready: false };
    else if (path.endsWith("/scenarios")) body = [scenario];
    else if (path.endsWith("/sessions/21")) body = { id: 21, status: completed ? "completed" : "in_progress", mode: 5, scenario, current_turn: completed ? null : { id: 31, order: 1, episode_id: 1, character_id: "boss", question_text: "다음 주 배포 일정을 구체적으로 설명해 주세요." }, history: [] };
    else if (path.endsWith("/progress")) body = { status: "completed", stage: "done", pct: 100 };
    else if (path.endsWith("/report")) body = report;
    else if (path.endsWith("/history")) body = { items: [] };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  return { context, page, errors, calls };
}

async function capture(page, name, details = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
  observations.push({ name, url: page.url(), viewport: page.viewportSize(), ...details });
}

test("mirror readability, permission recovery and completed-session navigation", { timeout: 90_000 }, async t => {
  await mkdir(artifacts, { recursive: true });
  const server = await start(false, process.env.VISUAL_QA_MIRROR_DIST);
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  for (const viewport of [{ width: 800, height: 1280 }, { width: 1080, height: 1920 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const { context, page, errors } = await pageFor(browser, viewport, false);
    try {
      await page.goto(server.url + "?service=workplace&mirror=1");
      await page.locator(".practice-question-panel h2").waitFor();
      await page.getByRole("button", { name: "카메라·마이크 연결", exact: true }).click();
      await page.getByRole("button", { name: "카메라·마이크 연결", exact: true }).click();
      await page.locator(".camera-reconnect small.is-error").waitFor();
      const metrics = await page.evaluate(() => {
        const error = document.querySelector(".camera-reconnect small").getBoundingClientRect();
        const hud = document.querySelector(".camera-dialogue").getBoundingClientRect();
        const rgb = getComputedStyle(document.querySelector(".practice-question-panel h2")).color.match(/\d+/g).slice(0, 3).map(Number);
        const linear = rgb.map(v => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        return { contrastOnBlack: (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05) / 0.05, overlap: Math.max(0, Math.min(error.bottom, hud.bottom) - Math.max(error.top, hud.top)), scrollWidth: document.documentElement.scrollWidth, width: innerWidth };
      });
      assert.ok(metrics.contrastOnBlack >= 7, JSON.stringify(metrics));
      assert.equal(metrics.overlap, 0, "permission recovery text remains above the HUD");
      assert.equal(metrics.scrollWidth, metrics.width);
      await capture(page, `mirror-recovery-${viewport.width}`, metrics);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  const { context, page, errors, calls } = await pageFor(browser, { width: 800, height: 1280 }, true);
  try {
    await page.goto(server.url + "?service=workplace&mirror=1");
    await page.locator(".unified-report__fit").first().waitFor();
    await page.getByRole("button", { name: "홈으로 돌아가기", exact: true }).click();
    await page.locator(".home-page").waitFor();
    await capture(page, "completed-back-home");
    await page.goBack();
    await page.locator(".report-page").waitFor();
    // Simulate a stale history entry from the now-ended practice.
    await page.evaluate(() => { history.pushState({ mirrorTingView: "practice" }, ""); window.dispatchEvent(new PopStateEvent("popstate", { state: { mirrorTingView: "practice" } })); });
    assert.equal(await page.locator(".practice-screen").count(), 0);
    await capture(page, "completed-stale-history-result", { calls });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  await writeFile(join(artifacts, "mirror.json"), JSON.stringify(observations, null, 2));
});

test("static demo empty completion is honest; cancel, retry, repeated click and sample exploration", { timeout: 90_000 }, async t => {
  await mkdir(artifacts, { recursive: true });
  const server = await start(true, process.env.VISUAL_QA_STATIC_DIST);
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page, errors, calls } = await pageFor(browser, viewport, false, false);
    try {
      await page.goto(server.url + "?service=interview");
      assert.match(await page.locator(".demo-mode-notice").innerText(), /정적 데모/);
      if (viewport.width > 600) {
        await page.getByRole("button", { name: "체험자 메뉴", exact: true }).click();
        assert.equal(await page.getByRole("button", { name: /운영 대시보드/ }).isDisabled(), true);
        await capture(page, "static-admin-unavailable");
        await page.getByRole("button", { name: "체험자 메뉴", exact: true }).click();
      }
      await page.getByRole("button", { name: "연습할 직무 고르기", exact: true }).first().click();
      await page.getByRole("button", { name: /풀스택 개발자/ }).first().click();
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음 단계로", exact: true }).click();
      await page.locator("input[type=checkbox]").check();
      await page.locator(".preview-start-button").click();
      await page.locator(".practice-screen").waitFor();
      await page.getByRole("button", { name: "연습 종료", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: /계속|취소/ }).click();
      assert.equal(await page.locator(".practice-screen").count(), 1);
      await page.getByRole("button", { name: "연습 종료", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "연습 종료", exact: true }).evaluate(button => { button.click(); button.click(); });
      await page.locator(".unified-report__fit").first().waitFor();
      const text = await page.locator(".report-page").innerText();
      assert.doesNotMatch(text, /상위 \d|74점|86%|답변 내용을 조금 더 구체적으로 설명하겠습니다|질문을 끝까지 듣고 답변을 완성/);
      assert.match(text, /제출한 답변이 없어/);
      assert.equal(await page.locator(".unified-report__rewrite").count(), 0);
      assert.equal(await page.locator(".unified-report__fit strong").allTextContents().then(values => values.every(value => value === "—")), true);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("mirror-ting-static-interview-history")).length), 1);
      assert.match(await page.locator(".demo-mode-notice").innerText(), /정적 데모/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await capture(page, `static-empty-result-${viewport.width}`, { calls });
      await page.getByRole("button", { name: /같은 상황 다시 연습/ }).click();
      await page.locator(".preview-page").waitFor();
      const consent = page.locator("input[type=checkbox]");
      if (!(await consent.isChecked())) await consent.check();
      await page.locator(".preview-start-button").click();
      await page.locator(".practice-screen").waitFor();
      assert.equal(await page.locator(".report-page").count(), 0, "retry starts a new in-progress session");
      await page.goto(server.url + "?demo=result");
      await page.locator(".unified-report__fit").first().waitFor();
      assert.match(await page.locator(".demo-mode-notice").innerText(), /샘플이며 내 측정 결과가 아니/);
      await capture(page, `explicit-sample-${viewport.width}`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  await writeFile(join(artifacts, "static.json"), JSON.stringify(observations, null, 2));
});
