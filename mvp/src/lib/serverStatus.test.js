import assert from "node:assert/strict";
import { test } from "node:test";
import { describeHealth } from "./serverStatus.js";

test("describeHealth reports a healthy backend with its active providers", () => {
  const status = describeHealth({ ok: true, degraded: false, server_stt: "whisper", dialogue_provider: "template" });
  assert.equal(status.tone, "ok");
  assert.equal(status.label, "분석 서버 연결됨");
  assert.match(status.detail, /whisper/);
  assert.match(status.detail, /template/);
});

test("describeHealth surfaces degraded reasons in Korean", () => {
  const status = describeHealth({ ok: true, degraded: true, degraded_reasons: ["ollama_unreachable"] });
  assert.equal(status.tone, "degraded");
  assert.match(status.detail, /Ollama/);
});

test("describeHealth keeps unknown degraded reasons readable", () => {
  const status = describeHealth({ ok: true, degraded: true, degraded_reasons: ["mystery_flag"] });
  assert.equal(status.tone, "degraded");
  assert.match(status.detail, /mystery_flag/);
});

test("describeHealth treats missing or failed health as down with a recovery hint", () => {
  for (const health of [null, undefined, {}, { ok: false }]) {
    const status = describeHealth(health);
    assert.equal(status.tone, "down");
    assert.match(status.detail, /expo_start/);
  }
});
