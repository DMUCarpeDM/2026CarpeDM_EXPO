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

test("submitResponse uploads audio then submits a JSON response to the PoC backend", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const finished = url.endsWith("/response");
    return new Response(JSON.stringify(finished ? { finished: true } : { ok: true, transcript: "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const audio = new Blob(["turn audio"], { type: "audio/webm" });
  const nonverbal = { camera_width: 1280, camera_height: 720, video_track_ready: true };
  await submitResponse(
    { id: "session-1", access_token: "token-1" },
    "turn-1",
    { text: "I will send the report today.", audio, durationMs: 1234, nonverbalMetrics: nonverbal },
  );

  // ① 오디오는 별도 multipart 엔드포인트(field `file`)로 업로드
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/audio");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["X-Session-Token"], "token-1");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.ok(calls[0].options.body.get("file") instanceof File);

  // ② 응답은 JSON ResponseIn 계약으로 제출
  assert.equal(calls[1].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/response");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    text: "I will send the report today.",
    stt_source: "webspeech",
    duration_ms: 1234,
    nonverbal,
  });
});

test("submitResponse still submits a JSON response when there is no audio", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ finished: false, next_turn: { id: 2 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await submitResponse(
    { id: "session-1", access_token: "token-1" },
    "turn-1",
    { text: "typed answer", audio: null, durationMs: 500, nonverbalMetrics: {} },
  );

  // 오디오가 없으면 업로드를 건너뛰고 곧바로 JSON 응답만 보낸다
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/response");
  assert.equal(JSON.parse(calls[0].options.body).text, "typed answer");
});
