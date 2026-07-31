import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_FLOW_IDLE_TIMEOUT_MS,
  buildRetainedRecord,
  isReportFlowView,
  readRetainedRecords,
  retainedAudioReference,
  saveRetainedRecord,
} from "./exhibitionSession.js";

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
}

test("buildRetainedRecord keeps completed audio references and analysis result", () => {
  const record = buildRetainedRecord({
    session: { id: "session-1" },
    report: { total_score: 84, fit_scores: { voice: { score: 80 } } },
    audioReferences: [
      retainedAudioReference("session-1", "turn-1"),
      retainedAudioReference("session-1", "turn-2"),
    ],
    completedAt: "2026-07-13T12:00:00.000Z",
  });

  assert.equal(record.session_id, "session-1");
  assert.equal(record.audio_reference, "indexeddb://mirror-ting-retained-audio/session-1/turn-1");
  assert.deepEqual(record.audio_references, [
    "indexeddb://mirror-ting-retained-audio/session-1/turn-1",
    "indexeddb://mirror-ting-retained-audio/session-1/turn-2",
  ]);
  assert.deepEqual(record.analysis_result, { total_score: 84, fit_scores: { voice: { score: 80 } } });
  assert.equal(record.completed_at, "2026-07-13T12:00:00.000Z");
});

test("saveRetainedRecord preserves the newest record for each completed session", () => {
  const storage = memoryStorage();
  saveRetainedRecord(storage, buildRetainedRecord({
    session: { id: "session-1" },
    report: { total_score: 70 },
    audioReferences: [retainedAudioReference("session-1", "turn-1")],
    completedAt: "2026-07-13T12:00:00.000Z",
  }));
  saveRetainedRecord(storage, buildRetainedRecord({
    session: { id: "session-1" },
    report: { total_score: 91 },
    audioReferences: [retainedAudioReference("session-1", "turn-2")],
    completedAt: "2026-07-13T12:05:00.000Z",
  }));

  const records = readRetainedRecords(storage);
  assert.equal(records.length, 1);
  assert.equal(records[0].analysis_result.total_score, 91);
  assert.equal(records[0].audio_reference, "indexeddb://mirror-ting-retained-audio/session-1/turn-2");
});

test("isReportFlowView limits kiosk idle reset to the report flow", () => {
  assert.equal(REPORT_FLOW_IDLE_TIMEOUT_MS, 90_000);
  assert.equal(isReportFlowView("result"), true);
  assert.equal(isReportFlowView("feedback"), true);
  assert.equal(isReportFlowView("compare"), true);
  assert.equal(isReportFlowView("share"), true);
  assert.equal(isReportFlowView("practice"), false);
  assert.equal(isReportFlowView("home"), false);
});
