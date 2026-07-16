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

// 백엔드 계약(poc/backend sessions.py): 오디오는 /audio(멀티파트 `file`)로 먼저,
// 답변 본문은 /response(JSON ResponseIn)로 — 한 멀티파트에 섞으면 422가 난다.
test("submitResponse uploads audio to /audio first then posts JSON to /response", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ finished: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const audio = new Blob(["turn audio"], { type: "audio/wav" });
  await submitResponse(
    { id: "session-1", access_token: "token-1" },
    "turn-1",
    {
      text: "I will send the report today.",
      audio,
      sttSource: "webspeech",
      durationMs: 1234,
      nonverbal: { front_gaze_ratio: 0.9, gaze_off_count: 1, avg_shoulder_tilt_deg: 2.5, frames: 20 },
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/audio");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["X-Session-Token"], "token-1");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.ok(calls[0].options.body.get("file") instanceof File);

  assert.equal(calls[1].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/response");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    text: "I will send the report today.",
    stt_source: "webspeech",
    duration_ms: 1234,
    nonverbal: { front_gaze_ratio: 0.9, gaze_off_count: 1, avg_shoulder_tilt_deg: 2.5, frames: 20 },
  });
});

test("submitResponse still posts the answer when the audio upload fails", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/audio")) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ finished: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await submitResponse(
    { id: "session-1", access_token: "token-1" },
    "turn-1",
    { text: "text only", audio: new Blob(["x"], { type: "audio/wav" }), durationMs: 10, nonverbal: null },
  );

  assert.equal(result.finished, false);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith("/response"));
});

test("submitResponse skips the audio route when there is no recording", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ finished: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await submitResponse(
    { id: "session-1", access_token: "token-1" },
    "turn-1",
    { text: "typed answer", audio: null, sttSource: "text", durationMs: 10, nonverbal: null },
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/response"));
  assert.equal(JSON.parse(calls[0].options.body).stt_source, "text");
});
