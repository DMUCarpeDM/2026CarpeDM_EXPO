import assert from "node:assert/strict";
import test from "node:test";
import { wavHasSpeech } from "./audioWav.js";

// encodeWav와 같은 포맷(44바이트 헤더 + 16-bit PCM mono)의 조각을 만든다
function makeWavBlob(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer]);
}

test("무음 조각은 말소리로 보지 않는다", async () => {
  assert.equal(await wavHasSpeech(makeWavBlob(new Float32Array(16000))), false);
});

test("마이크 잡음 수준(RMS·피크 모두 낮음)은 걸러진다", async () => {
  const noise = Float32Array.from({ length: 16000 }, (_, i) => 0.003 * Math.sin(i * 1.7));
  assert.equal(await wavHasSpeech(makeWavBlob(noise)), false);
});

test("단발 클릭(피크만 높음)은 말소리가 아니다", async () => {
  const click = new Float32Array(16000);
  click[8000] = 0.9; // 한 샘플 팝 — RMS는 거의 0
  assert.equal(await wavHasSpeech(makeWavBlob(click)), false);
});

test("말소리 수준 파형은 통과한다", async () => {
  const speech = Float32Array.from({ length: 16000 }, (_, i) => 0.12 * Math.sin((i / 16000) * 2 * Math.PI * 180));
  assert.equal(await wavHasSpeech(makeWavBlob(speech)), true);
});

test("헤더뿐인 조각은 false", async () => {
  assert.equal(await wavHasSpeech(makeWavBlob(new Float32Array(0))), false);
});
