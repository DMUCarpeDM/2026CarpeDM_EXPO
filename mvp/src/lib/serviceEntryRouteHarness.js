import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const mvpRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const artifactParent = resolve(mvpRoot, "../.omo/evidence/task-3-browser");
export const activeSessionKey = "mirror-ting-active-session";

const scenarios = [{
  slug: "office-scenario",
  title: "업무 대화",
  job_role: "office_admin",
  characters: [{ id: "boss", name: "김 팀장", role: "팀장" }],
  episodes: [
    { id: 101, title: "일정 보고", situation: "출시 일정을 보고해요.", character_id: "boss", modes: [5] },
    { id: 102, title: "피드백 대화", situation: "피드백을 나눠요.", character_id: "boss", modes: [5] },
  ],
}, {
  slug: "cafe-scenario",
  title: "카페 응대",
  job_role: "cafe_crew",
  characters: [{ id: "guest", name: "온도 고객", role: "고객" }],
  episodes: [{ id: 201, title: "주문 응대", situation: "주문을 확인해요.", character_id: "guest", modes: [5] }],
}];

const json = (route, value, status = 200) => route.fulfill({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
});

export async function startVite() {
  const server = await createServer({ root: mvpRoot, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object", "Vite exposes a dedicated test port");
  const url = `http://127.0.0.1:${address.port}/`;
  const deadline = Date.now() + 10_000;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    try { ready = (await fetch(url)).ok; } catch { ready = false; }
    if (!ready) await new Promise((resolveReady) => setTimeout(resolveReady, 40));
  }
  assert.equal(ready, true, "dedicated Vite harness becomes ready");
  return { server, url };
}

export async function withPage({ browser, baseUrl }, options, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const calls = [];
  const pageErrors = [];
  let releasePendingResume;
  let nfcDelivered = false;
  let nfcPollCount = 0;
  await context.addInitScript(({ entries }) => {
    localStorage.clear();
    for (const [key, value] of entries) localStorage.setItem(key, value);
    window.__serviceRouteTrace = [];
    const captureRoute = () => {
      const route = document.querySelector(".service-mode-page") ? "service"
        : document.querySelector(".home-page") ? "home"
          : document.querySelector(".role-choice-section") ? "role"
            : document.querySelector(".preview-page") ? "preview"
              : document.querySelector(".practice-screen") ? "practice"
                : document.querySelector(".feedback-page") ? "feedback"
                  : document.querySelector(".compare-report") ? "compare"
                    : document.querySelector(".share-page") ? "share"
                      : document.querySelector(".report-page") ? "result"
                        : document.querySelector(".kiosk-issue-screen") ? "kiosk"
                          : document.querySelector(".app-boot") ? "boot" : "blank";
      const next = { route, selector: Boolean(document.querySelector(".service-mode-page")), interactive: document.querySelectorAll("button, a, input, select, textarea").length };
      const prior = window.__serviceRouteTrace.at(-1);
      if (window.__serviceRouteTrace.length < 200 && JSON.stringify(prior) !== JSON.stringify(next)) window.__serviceRouteTrace.push(next);
    };
    new MutationObserver(captureRoute).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("DOMContentLoaded", captureRoute, { once: true });
  }, { entries: Object.entries(options.storage || {}) });
  await context.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    calls.push(requestUrl.pathname);
    if (requestUrl.pathname === "/api/scenarios") return json(route, scenarios);
    if (requestUrl.pathname === "/api/health") return json(route, { dialogue_provider: "test" });
    if (requestUrl.pathname === "/api/nfc/tap") {
      nfcPollCount += 1;
      if (options.nfcCard && nfcPollCount > 1 && !nfcDelivered) {
        nfcDelivered = true;
        return json(route, { seq: 1, uid: options.nfcCard.uid, reader: "mirror", at: 1 });
      }
      return json(route, { seq: nfcDelivered ? 1 : 0, uid: "", reader: requestUrl.searchParams.get("reader"), at: 0 });
    }
    if (requestUrl.pathname === "/api/nfc/resolve") return json(route, options.nfcCard || {});
    if (requestUrl.pathname === "/api/sessions/saved") {
      if (options.resume === "timeout") {
        await new Promise((resolvePending) => { releasePendingResume = resolvePending; });
        return route.abort();
      }
      if (options.resume === "error") return json(route, { detail: "lookup failed" }, 500);
      const status = options.resume === "missing" ? undefined : options.resume;
      return json(route, { id: "saved", status, current_turn: { id: "turn-1", question_text: "상황을 설명해 주세요." }, history: [], scenario: { title: "저장된 연습", characters: [] } });
    }
    if (requestUrl.pathname.endsWith("/progress")) return json(route, { status: "pending", stage: "queued", pct: 12 });
    return json(route, {});
  });
  const page = await context.newPage();
  if (options.controlClock) {
    const clockOrigin = new Date("2026-08-22T00:00:00Z");
    await page.clock.install({ time: clockOrigin });
    await page.clock.pauseAt(clockOrigin);
  }
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(`${baseUrl}${options.query || ""}`, { waitUntil: "domcontentloaded" });
    return await run({ page, calls, pageErrors });
  } finally {
    releasePendingResume?.();
    await context.close();
  }
}

export const routeTrace = (page) => page.evaluate(() => window.__serviceRouteTrace || []);

export async function capture(page, path, stableSelector) {
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    return element && Number.parseFloat(getComputedStyle(element).opacity) >= 0.99;
  }, stableSelector);
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path, fullPage: true });
}
