import test from "node:test";
import assert from "node:assert/strict";

globalThis.__MIRROR_TING_API_BASE__ = "http://127.0.0.1:8000/api";
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

test("createSession preserves ultra pressure for the persona prompt", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: "session-2" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await createSession({ difficulty: "ultra_pressure", mode: 10, scenarioSlug: "release-schedule-alignment", consent: true });

  assert.equal(JSON.parse(calls[0].options.body).difficulty, "ultra_pressure");
});

test("createSession sends the selected backend episode", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: "session-3" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await createSession({ difficulty: "basic", mode: 5, scenarioSlug: "release-schedule-alignment", selectedEpisodeId: 42, consent: true });

  assert.equal(JSON.parse(calls[0].options.body).selected_episode_id, 42);
});

// 백엔드 계약(poc/backend sessions.py): 오디오는 /audio(멀티파트 `file`),
// 답변 본문은 /response(JSON ResponseIn) — 한 멀티파트에 섞으면 422가 난다.
// 텍스트가 있으면 /response가 먼저다: 오디오를 먼저 올리면 서버가 빈 턴으로 보고
// 녹음 전체를 whisper로 전사해 다음 질문이 수십 초 늦어진다.
test("submitResponse posts /response first then uploads audio (skips wasteful server STT)", async () => {
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
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/response");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    text: "I will send the report today.",
    stt_source: "webspeech",
    duration_ms: 1234,
    nonverbal: { front_gaze_ratio: 0.9, gaze_off_count: 1, avg_shoulder_tilt_deg: 2.5, frames: 20 },
  });

  assert.equal(calls[1].url, "http://127.0.0.1:8000/api/sessions/session-1/turns/turn-1/audio");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["X-Session-Token"], "token-1");
  assert.ok(calls[1].options.body instanceof FormData);
  assert.ok(calls[1].options.body.get("file") instanceof File);
});

test("submitResponse uploads audio first only when there is no text (offline STT fallback)", async () => {
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
    { text: "", audio: new Blob(["x"], { type: "audio/wav" }), sttSource: "text", durationMs: 10, nonverbal: null },
  );

  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith("/audio"));
  assert.ok(calls[1].url.endsWith("/response"));
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
  assert.ok(calls[0].url.endsWith("/response"));
  assert.ok(calls[1].url.endsWith("/audio"));
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
