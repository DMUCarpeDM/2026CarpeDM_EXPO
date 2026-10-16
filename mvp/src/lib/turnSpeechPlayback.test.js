import test from "node:test";
import assert from "node:assert/strict";
import { startTurnSpeech } from "./turnSpeechPlayback.js";

test("empty text never requests or plays speech", t => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected TTS request"); });
  for (const text of ["", " ", "\n"]) {
    let finished = 0;
    const stop = startTurnSpeech({ text, serverTtsReady: true,
      onSpeakingChange: value => assert.equal(value, false), onFinish: () => finished++ });
    assert.equal(finished, 1);
    stop();
  }
  assert.equal(fetch.mock.callCount(), 0);
});

function playbackEnvironment(t) {
  let stopPlayback;
  t.after(() => stopPlayback?.());
  const timers = new Map();
  const utterances = [];
  const audioPlayers = [];
  const speaking = [];
  const notes = [];
  const progress = [];
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
      setInterval: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
      clearInterval: (id) => timers.delete(id),
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
    synth, koreanVoice, utterances, audioPlayers, speaking, notes, progress, timers, revoke,
    get finished() { return finished; },
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    start(serverTtsReady = false, text = "안녕하세요.", preparedAudioUrl, options = {}) {
      const stop = startTurnSpeech({
        text, serverTtsReady, preparedAudioUrl, ...options,
        onSpeakingChange: (value) => speaking.push(value),
        onFinish: () => { finished++; },
        onNote: (note) => notes.push(note),
        onProgress: (value) => progress.push(value),
      });
      stopPlayback = stop;
      return stop;
    },
  };
}

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

test("AI text resembling a question label is still spoken", (t) => {
  const env = playbackEnvironment(t);
  env.start(false, "질문 2");
  env.flushTimers();
  assert.equal(env.utterances[0].text, "질문 2");
  assert.equal(env.finished, 0);
});

test("browser speech uses Korean voice and signals completion", (t) => {
  const env = playbackEnvironment(t);
  env.start();
  env.flushTimers();
  const utterance = env.utterances[0];
  assert.equal(utterance.text, "안녕하세요.");
  assert.equal(utterance.voice, env.koreanVoice);
  assert.equal(utterance.lang, "ko-KR");
  assert.equal(env.progress.at(-1).status, "waiting");
  utterance.onstart();
  assert.equal(env.progress.at(-1).status, "playing");
  utterance.onboundary({ charIndex: 3 });
  assert.equal(env.progress.at(-1).charIndex, 3);
  utterance.onend();
  assert.equal(env.progress.at(-1).status, "ended");
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
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { text: "안녕하세요.", voice: "female" });
    return new Response("wav", { headers: { "Content-Type": "audio/wav" } });
  });
  const stop = env.start(true);
  await flushAsync();
  assert.equal(env.audioPlayers.length, 1);
  const audio = env.audioPlayers[0];
  assert.equal(env.progress.at(-1).status, "waiting");
  audio.duration = 10; audio.currentTime = 5; audio.onplaying();
  assert.equal(env.progress.at(-1).charIndex, 3);
  audio.currentTime = 8; audio.ontimeupdate();
  assert.equal(env.progress.at(-1).charIndex, 4);
  const lateEnded = audio.onended;
  stop();
  assert.equal(env.progress.at(-1).status, "cancelled");
  assert.equal(env.audioPlayers[0].pause.mock.callCount(), 1);
  assert.equal(env.revoke.mock.calls[0].arguments[0], "blob:turn-audio");
  assert.equal(audio.onended, null);
  lateEnded();
  assert.equal(env.finished, 0);
  assert.equal(env.speaking.at(-1), false);
  assert.equal(env.progress.at(-1).status, "cancelled");
});

test("server end removes progress handlers and finishes subtitles immediately", async t => {
  const env = playbackEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => new Response("wav"));
  env.start(true);
  await flushAsync();
  const audio = env.audioPlayers[0];
  audio.onplaying();
  audio.onended();
  assert.equal(env.progress.at(-1).status, "ended");
  assert.equal(audio.ontimeupdate, null);
  assert.equal(audio.onplaying, null);
});

test("a late server response cannot start speech after cancellation", async (t) => {
  const env = playbackEnvironment(t);
  let respond;
  t.mock.method(globalThis, "fetch", () => new Promise((resolve) => { respond = resolve; }));
  const stop = env.start(true);
  await flushAsync();
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

test("cancelling aborts a pending server request without browser fallback", async (t) => {
  const env = playbackEnvironment(t);
  let signal;
  t.mock.method(globalThis, "fetch", (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError"))));
  });
  const stop = env.start(true);
  await flushAsync();
  stop();
  await flushAsync();
  env.flushTimers();
  assert.equal(signal.aborted, true);
  assert.equal(env.utterances.length, 0);
  assert.equal(env.finished, 0);
});

test("prepared opening plays file without live TTS and follows playback clock", async (t) => {
  const env = playbackEnvironment(t);
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected live TTS"); });
  const stop = env.start(true, "첫 질문입니다.", "/audio/workplace-openings/scenario-2.mp3");
  await flushAsync();
  assert.equal(fetch.mock.callCount(), 0);
  const audio = env.audioPlayers[0];
  assert.equal(audio.url, "/audio/workplace-openings/scenario-2.mp3");
  audio.duration = 4; audio.currentTime = 2; audio.onplaying();
  assert.equal(env.progress.at(-1).charIndex, 4);
  audio.onended();
  assert.equal(env.finished, 1);
  assert.equal(env.utterances.length, 0);
  stop();
  assert.equal(audio.pause.mock.callCount(), 1);
});

test("mirror server failure never switches to browser speech", async t => {
  const env = playbackEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  env.start(true, "후속 질문입니다.", undefined, { allowBrowserFallback: false, expectedServerProvider: "elevenlabs" });
  await flushAsync(); env.flushTimers();
  assert.equal(env.utterances.length, 0);
  assert.equal(env.finished, 1);
  assert.equal(env.progress.at(-1).status, "unavailable");
});

test("mirror rejects unexpected provider audio instead of changing voice", async t => {
  const env = playbackEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => new Response("wav", { headers: { "Content-Type": "audio/wav", "X-TTS-Provider": "unexpected" } }));
  env.start(true, "후속 질문입니다.", undefined, { allowBrowserFallback: false, expectedServerProvider: "elevenlabs" });
  await flushAsync(); env.flushTimers();
  assert.equal(env.audioPlayers.length, 0);
  assert.equal(env.utterances.length, 0);
  assert.equal(env.finished, 1);
});

test("broken prepared opening never falls back to another voice", async t => {
  const env = playbackEnvironment(t);
  env.start(true, "첫 질문입니다.", "/opening.mp3", { allowBrowserFallback: false, expectedServerProvider: "elevenlabs" });
  await flushAsync(); env.audioPlayers[0].onerror(); env.flushTimers();
  assert.equal(env.utterances.length, 0);
  assert.equal(env.finished, 1);
});

test("stalled server synthesis aborts and falls back once without late playback", async t => {
  const env = playbackEnvironment(t);
  let respond, signal;
  t.mock.method(globalThis, "fetch", (_url, options) => {
    signal = options.signal;
    return new Promise(resolve => { respond = resolve; });
  });
  env.start(true);
  await flushAsync();
  env.flushTimers();
  assert.equal(signal.aborted, true);
  respond(new Response("wav", { headers: { "Content-Type": "audio/wav" } }));
  await flushAsync();
  env.flushTimers();
  assert.equal(env.audioPlayers.length, 0);
  assert.equal(env.utterances.length, 1);
  env.utterances[0].onend();
  env.utterances[0].onend();
  assert.equal(env.finished, 1);
});

test("prepared audio startup timeout pauses the file before browser fallback", async t => {
  const env = playbackEnvironment(t);
  env.start(true, "준비된 음성", "/opening.wav");
  await flushAsync();
  const audio = env.audioPlayers[0];
  env.flushTimers();
  env.flushTimers();
  assert.equal(audio.pause.mock.callCount(), 1);
  assert.equal(audio.onplaying, null);
  assert.equal(env.utterances.length, 1);
});

test("an immediately replaced turn never starts a duplicate server request", async t => {
  const env = playbackEnvironment(t);
  const request = t.mock.method(globalThis, "fetch", async () => new Response("wav"));
  const stop = env.start(true);
  stop();
  env.start(true);
  await flushAsync();
  assert.equal(request.mock.callCount(), 1);
  assert.equal(env.audioPlayers.length, 1);
});
