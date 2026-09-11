import test from "node:test";
import assert from "node:assert/strict";
import { startTurnSpeech } from "./turnSpeechPlayback.js";

function playbackEnvironment(t) {
  let stopPlayback;
  t.after(() => stopPlayback?.());
  const timers = new Map();
  const utterances = [];
  const audioPlayers = [];
  const speaking = [];
  const notes = [];
  let finished = 0;
  let nextTimer = 0;
  const koreanVoice = { lang: "ko-KR", localService: true };
  const synth = {
    getVoices: () => [koreanVoice],
    cancel: t.mock.fn(),
    speak: (utterance) => utterances.push(utterance),
  };
  const globals = {
    window: {
      speechSynthesis: synth,
      setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout: (id) => timers.delete(id),
    },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    Audio: class {
      constructor(url) { this.url = url; this.pause = t.mock.fn(); audioPlayers.push(this); }
      async play() { this.onplay?.(); }
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  t.mock.method(URL, "createObjectURL", () => "blob:turn-audio");
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  return {
    synth, koreanVoice, utterances, audioPlayers, speaking, notes, timers, revoke,
    get finished() { return finished; },
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    start(serverTtsReady = false) {
      const stop = startTurnSpeech({
        text: "안녕하세요.", serverTtsReady,
        onSpeakingChange: (value) => speaking.push(value),
        onFinish: () => { finished++; },
        onNote: (note) => notes.push(note),
      });
      stopPlayback = stop;
      return stop;
    },
  };
}

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

test("browser speech uses Korean voice and signals completion", (t) => {
  const env = playbackEnvironment(t);
  env.start();
  env.flushTimers();
  const utterance = env.utterances[0];
  assert.equal(utterance.text, "안녕하세요.");
  assert.equal(utterance.voice, env.koreanVoice);
  assert.equal(utterance.lang, "ko-KR");
  utterance.onstart();
  utterance.onend();
  assert.equal(env.speaking.at(-1), false);
  assert.equal(env.finished, 1);
});

test("unsupported speech finishes with a subtitle diagnostic", (t) => {
  const env = playbackEnvironment(t);
  window.speechSynthesis = undefined;
  env.start();
  assert.equal(env.finished, 1);
  assert.equal(env.speaking.at(-1), false);
  assert.match(env.notes[0], /자막/);
});

test("server speech failure falls back to browser speech", async (t) => {
  const env = playbackEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  env.start(true);
  await flushAsync();
  env.flushTimers();
  assert.equal(env.utterances.length, 1);
  assert.match(env.notes[0], /브라우저 음성으로 전환/);
});

test("server audio stops and releases its URL when the turn is cancelled", async (t) => {
  const env = playbackEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => new Response("mp3"));
  const stop = env.start(true);
  await flushAsync();
  assert.equal(env.audioPlayers.length, 1);
  stop();
  assert.equal(env.audioPlayers[0].pause.mock.callCount(), 1);
  assert.equal(env.revoke.mock.calls[0].arguments[0], "blob:turn-audio");
  env.audioPlayers[0].onended();
  assert.equal(env.finished, 0);
  assert.equal(env.speaking.at(-1), false);
});

test("a late server response cannot start speech after cancellation", async (t) => {
  const env = playbackEnvironment(t);
  let respond;
  t.mock.method(globalThis, "fetch", () => new Promise((resolve) => { respond = resolve; }));
  const stop = env.start(true);
  stop();
  respond(new Response("mp3"));
  await flushAsync();
  assert.equal(env.audioPlayers.length, 0);
  assert.equal(env.utterances.length, 0);
  assert.equal(env.finished, 0);
});

test("cancelling browser speech clears its pending start timer", (t) => {
  const env = playbackEnvironment(t);
  const stop = env.start();
  stop();
  assert.equal(env.timers.size, 0);
  env.flushTimers();
  assert.equal(env.utterances.length, 0);
});
