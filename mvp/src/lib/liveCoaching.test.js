import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startLiveCoaching } from './liveCoaching.js';

function harness(observe, memory) {
  let tick;
  let time = 0;
  const tips = [];
  const stop = startLiveCoaching({ observe, sample: () => ({durationMs: 5000}), onTip: tip => tips.push(tip),
    now: () => time, setIntervalFn: fn => { tick = fn; return 1; }, clearIntervalFn: () => {}, memory });
  return { tick: () => tick(), stop, tips, time: t => { time = t; } };
}

test('same evidence is shown once and different tips wait twenty seconds', async () => {
  let id = 'a';
  const h = harness(async () => ({tip:{id}}));
  await h.tick(); await h.tick();
  id = 'b'; h.time(10000); await h.tick();
  assert.equal(h.tips.length, 1);
  h.time(20000); await h.tick();
  assert.deepEqual(h.tips.map(t => t.id), ['a','b']);
  h.stop();
});

test('late response and overlapping requests are discarded on stop', async () => {
  let resolve, calls = 0, signal;
  const h = harness((input, s) => { calls++; signal = s; return new Promise(r => {resolve = r;}); });
  const pending = h.tick();
  await h.tick(); assert.equal(calls, 1);
  h.stop(); assert.ok(signal.aborted);
  resolve({tip:{id:'late'}}); await pending;
  assert.deepEqual(h.tips, []);
});

test('cooldown survives a pause or new turn', async () => {
  const memory = { lastShown: -Infinity, shown: new Set() };
  const a = harness(async () => ({tip:{id:'a'}}), memory);
  await a.tick(); a.stop();
  const b = harness(async () => ({tip:{id:'b'}}), memory);
  b.time(10000); await b.tick(); assert.equal(b.tips.length, 0);
  b.time(21000); await b.tick(); assert.equal(b.tips.length, 1); b.stop();
});
