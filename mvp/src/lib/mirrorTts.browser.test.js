import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { startVite } from "./serviceEntryRouteHarness.js";

test("workplace mirror always requests ElevenLabs and never falls back to browser speech", { timeout: 75_000 }, async (t) => {
  const { server, url } = await startVite();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());

  for (const [gender, serverReady, expectedRequests] of [["female", true, 1], ["female", false, 1], ["male", true, 1], [undefined, true, 1]]) {
    const page = await browser.newPage();
    try {
      const errors = [];
      const requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem("mirror-ting-active-session", JSON.stringify({ id: 21, access_token: "test-token" }));
        navigator.mediaDevices.getUserMedia = async () => { throw new Error("no physical devices in test"); };
        window.__browserSpeechCount = 0;
        Object.defineProperty(window.speechSynthesis, "speak", { value: (utterance) => {
          window.__browserSpeechCount++;
          setTimeout(() => utterance.onend?.(), 10);
        } });
      });
      const scenario = {
        slug: "workplace-conversation", title: "직장 대화",
        characters: [{ id: "c", name: "박선임", voice_gender: gender }],
        episodes: [{ id: 1, character_id: "c", modes: [5] }],
      };
      await page.route("**/api/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/tts")) {
          requests.push(route.request().postDataJSON());
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "ElevenLabs unavailable" }) });
        }
        const body = path.endsWith("/health") ? {
          dialogue_provider: "gemini", dialogue_ready: true,
          tts_ready: true, tts_provider: "elevenlabs",
          tts_female: serverReady ? "elevenlabs" : "browser", tts_male: "browser",
        } : path.endsWith("/scenarios") ? [scenario]
          : path.endsWith("/sessions/21") ? {
            id: 21, status: "in_progress", mode: 5, scenario, history: [],
            voice_analysis: { engine_version: "voice-measure-v2", calibration: { id: "standard-v1", source: "standard", status: "standard", can_proceed: true } },
            current_turn: { id: 31, order: 1, episode_id: 1, character_id: "c", question_text: "자료를 확인해 주세요." },
            interaction: { mode: "workplace_continuous", index: 0, total: 12,
              briefing: { step: 1, total: 12, category_label: "출근", title: "첫 출근", situation: "자료를 전달받았습니다." } },
          } : {};
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto(`${url}?service=workplace&mirror=1`);
      await page.locator(".simulation-dialogue-text").waitFor();
      await page.waitForFunction(() => document.querySelector(".simulation-dialogue-text")?.textContent.includes("자료를 확인해 주세요."));
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => window.__browserSpeechCount), 0);
      // React StrictMode may issue an initial request that its cleanup aborts.
      assert.ok(requests.length >= expectedRequests && requests.length <= expectedRequests + 1, `${gender}, server ready=${serverReady}: ${requests.length} requests`);
      if (expectedRequests) assert.deepEqual(requests[0], { text: "자료를 확인해 주세요.", voice: "female" });
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  }
});
