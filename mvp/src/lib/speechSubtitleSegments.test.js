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
