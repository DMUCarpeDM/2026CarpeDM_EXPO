import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("workplace briefing traps focus and resumes without replaying entry", { timeout: 45_000 }, async (t) => {
  const { server, url } = await startVite();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 21, access_token: "test-token" }));
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("test has no camera"); };
    Object.defineProperty(window.speechSynthesis, "speak", { value: (utterance) => setTimeout(() => utterance.onend?.(), 10) });
  });
  const scenario = { slug: "workplace-conversation", title: "직장 대화", characters: [{ id: "c", name: "박선임" }], episodes: [{ id: 1, character_id: "c", modes: [5] }] };
  const turn = { id: 31, order: 1, episode_id: 1, character_id: "c", question_type: "initial", question_text: "자료를 확인해 주세요." };
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/health") ? { dialogue_provider: "gemini", dialogue_ready: true, tts_ready: false }
      : pathname.endsWith("/scenarios") ? [scenario]
        : pathname.endsWith("/sessions/21") ? { id: 21, status: "in_progress", mode: 5, scenario, current_turn: turn, history: [], interaction: {
          mode: "workplace_continuous", index: 0, total: 12,
          briefing: { step: 1, total: 12, category_label: "출근", title: "첫 출근", situation: "업무 자료를 전달받았습니다." },
        } } : {};
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(url);
  const dialog = page.getByRole("dialog", { name: "상황 안내" });
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /출근/);
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  const button = dialog.getByRole("button", { name: "대화 시작" });
  await button.focus();
  await page.keyboard.press("Tab");
  assert.equal(await button.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.locator(".practice-screen").count(), 1);
  assert.deepEqual(errors, []);
});
