import test from "node:test";
import assert from "node:assert/strict";
import { speechSubtitleSegments, activeSubtitleIndex } from "./speechSubtitleSegments.js";

test("subtitle focus follows character offsets across different sentence lengths", () => {
  const segments = speechSubtitleSegments("안녕하세요. 다음 설명을 들어주세요!");
  assert.deepEqual(segments.map(segment => segment.text), ["안녕하세요.", "다음 설명을 들어주세요!"]);
  assert.equal(activeSubtitleIndex(segments, 0), 0);
  assert.equal(activeSubtitleIndex(segments, 5), 0);
  assert.equal(activeSubtitleIndex(segments, 9), 1);
});

test("unpunctuated and empty text remain safe", () => {
  assert.equal(speechSubtitleSegments("한 문장").length, 1);
  assert.deepEqual(speechSubtitleSegments(""), []);
});

test("long captions use bounded cues with original TTS offsets and no lost words", async () => {
  const { speechSubtitleCues } = await import('./speechSubtitleSegments.js');
  const text = '자료를 확인하고 지금 맡은 업무가 어디까지 진행됐는지 구체적으로 설명해 주세요.   그리고 어려운 부분이 있으면 먼저 알려 주세요!';
  const cues = speechSubtitleCues(text);
  assert.ok(cues.length > 2);
  assert.equal(cues.map(c => c.text).join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  for (const [i, cue] of cues.entries()) {
    assert.ok(cue.text.length <= 28);
    assert.equal(text.slice(cue.start, cue.start + cue.text.length), cue.text);
    assert.equal(activeSubtitleIndex(cues, cue.start), i);
  }
});
