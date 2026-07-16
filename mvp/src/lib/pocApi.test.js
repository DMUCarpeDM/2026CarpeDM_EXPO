import test from "node:test";
import assert from "node:assert/strict";

globalThis.__MIRRORTING_API_BASE__ = "http://127.0.0.1:8000/api";
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
};
const { createSession, resolveApiBase, submitResponse } = await import("./pocApi.js");

test("resolveApiBase keeps exhibition traffic on the local PC", () => {
  assert.equal(resolveApiBase("https://remote.example.com/api"), "/api");
  assert.equal(resolveApiBase("http://192.168.0.20:8000/api"), "/api");
  assert.equal(resolveApiBase("http://127.0.0.1:8000/api"), "http://127.0.0.1:8000/api");
  assert.equal(resolveApiBase("http://localhost:8000/api"), "http://localhost:8000/api");
  assert.equal(resolveApiBase("/api"), "/api");
});

test("createSession preserves the PoC setup payload", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: "session-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await createSession({ difficulty: "pressure", mode: 10, scenarioSlug: "cloud-meet", consent: true });

  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/sessions");
  assert.equal(calls[0].options.method, "POST");
  const payload = JSON.parse(calls[0].options.body);
  assert.match(payload.client_key, /.+/);
  assert.deepEqual(payload, {
    difficulty: "pressure",
    mode: 10,
    scenario_slug: "cloud-meet",
    client_key: payload.client_key,
    consent: { agreed: true, storage_policy: "none" },
  });
});

test("submitResponse follows the PoC two-call contract — audio upload then JSON response", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ finished: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const audio = new Blob(["turn audio"], { type: "audio/webm" });
  await submitResponse(
    { id: "session-1", access_token: "token-1" },
    "turn-1",
    {
      text: "I will send the report today.",
      audio,
      durationMs: 1234,
      nonverbalMetrics: { front_gaze_ratio: 0.8, frames: 120 },
    },
  );

  // ① 오디오는 /audio 엔드포인트에 'file' 필드 멀티파트로
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/audio");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["X-Session-Token"], "token-1");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.ok(calls[0].options.body.get("file") instanceof File);

  // ② 응답은 /response 엔드포인트에 JSON으로 (멀티파트를 보내면 백엔드가 422로 거부)
  assert.equal(calls[1].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/response");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["X-Session-Token"], "token-1");
  assert.equal(calls[1].options.headers["Content-Type"], "application/json");
  const payload = JSON.parse(calls[1].options.body);
  assert.deepEqual(payload, {
    text: "I will send the report today.",
    stt_source: "webspeech",
    duration_ms: 1234,
    nonverbal: { front_gaze_ratio: 0.8, frames: 120 },
  });
});

test("submitResponse still submits text when the audio upload fails", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/audio")) {
      return new Response(JSON.stringify({ detail: "저장 실패" }), { status: 500 });
    }
    return new Response(JSON.stringify({ finished: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await submitResponse(
    { id: "session-1", access_token: "token-1" },
    "turn-1",
    { text: "결론부터 말씀드리겠습니다.", audio: new Blob(["x"], { type: "audio/webm" }), durationMs: 900, nonverbalMetrics: null },
  );

  assert.equal(result.finished, false);
  assert.equal(calls.length, 2, "오디오 실패에도 텍스트 제출은 진행된다");
  assert.equal(calls[1].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/response");
});
