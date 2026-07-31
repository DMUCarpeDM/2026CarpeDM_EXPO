import test from "node:test";
import assert from "node:assert/strict";

globalThis.__MIRROR_TING_API_BASE__ = "http://127.0.0.1:8000/api";
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
};
const { createSession, getNfcTap, issueNfcCard, resolveApiBase, resolveNfcCard, submitResponse } = await import("./pocApi.js");

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

// NFC 시작(S-B2B-NFC): nfc_uid·job_role은 카드 흐름일 때만 실린다 — 기존 계약을 오염시키지 않는다.
test("createSession stamps the NFC card fields only when provided", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: "session-nfc" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await createSession({ difficulty: "basic", mode: 5, scenarioSlug: "ondo-cafe-crew", consent: true, jobRole: "cafe_crew", nfcUid: "04A1B2C3" });
  const nfcPayload = JSON.parse(calls[0].options.body);
  assert.equal(nfcPayload.job_role, "cafe_crew");
  assert.equal(nfcPayload.nfc_uid, "04A1B2C3");
  assert.equal(nfcPayload.scenario_slug, "ondo-cafe-crew");

  // 수동 폴백은 직무만, 일반 흐름은 둘 다 없이 — 미전달 필드는 body에 나타나지 않는다.
  await createSession({ difficulty: "basic", mode: 5, scenarioSlug: "release-schedule-alignment", consent: true, jobRole: "office_admin", nfcUid: "" });
  const manualPayload = JSON.parse(calls[1].options.body);
  assert.equal(manualPayload.job_role, "office_admin");
  assert.equal("nfc_uid" in manualPayload, false);

  await createSession({ difficulty: "basic", mode: 5, scenarioSlug: "release-schedule-alignment", consent: true });
  const plainPayload = JSON.parse(calls[2].options.body);
  assert.equal("job_role" in plainPayload, false);
  assert.equal("nfc_uid" in plainPayload, false);
});

test("NFC endpoints follow the backend contract paths", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ seq: 2, uid: "04AA", reader: "kiosk", at: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await getNfcTap("kiosk", 7);
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/nfc/tap?reader=kiosk&since=7");

  await issueNfcCard({ uid: "04AA", jobRole: "cafe_crew" });
  assert.equal(calls[1].url, "http://127.0.0.1:8000/api/nfc/issue");
  const issueBody = JSON.parse(calls[1].options.body);
  assert.equal(issueBody.job_role, "cafe_crew");
  assert.equal("scenario_slug" in issueBody, false); // 미지정이면 서버 기본 팩을 쓴다

  await resolveNfcCard("04AA");
  assert.equal(calls[2].url, "http://127.0.0.1:8000/api/nfc/resolve");
  assert.deepEqual(JSON.parse(calls[2].options.body), { uid: "04AA" });
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

test("422 detail 배열은 사용자용 문구로 축약된다 — '[object Object]' 토스트 방지", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ detail: [{ type: "string_pattern_mismatch", loc: ["body", "uid"] }] }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );

  await assert.rejects(
    issueNfcCard({ uid: "not-hex!", jobRole: "cafe_crew" }),
    (error) => {
      assert.equal(typeof error.message, "string");
      assert.ok(!error.message.includes("[object"));
      assert.ok(error.message.includes("입력 형식"));
      return true;
    },
  );
});

test("문자열 detail(HTTPException)은 그대로 사용자에게 전달된다", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: "등록되지 않았거나 폐기된 카드입니다" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(resolveNfcCard("04AABBCC"), (error) => {
    assert.equal(error.message, "등록되지 않았거나 폐기된 카드입니다");
    assert.equal(error.status, 404);
    return true;
  });
});
