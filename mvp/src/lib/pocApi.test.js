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

test("submitResponse sends text audio and nonverbal metrics to the PoC backend", async () => {
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
      nonverbalMetrics: { camera_width: 1280, camera_height: 720, video_track_ready: true },
    },
  );

  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/response");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["X-Session-Token"], "token-1");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.body.get("text"), "I will send the report today.");
  assert.equal(calls[0].options.body.get("duration_ms"), "1234");
  assert.deepEqual(JSON.parse(calls[0].options.body.get("nonverbal_metrics")), {
    camera_width: 1280,
    camera_height: 720,
    video_track_ready: true,
  });
  assert.ok(calls[0].options.body.get("audio") instanceof File);
});
