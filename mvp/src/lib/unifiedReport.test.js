import assert from "node:assert/strict";
import { test } from "node:test";
import { fitAriaLabel, saveAndShareReport } from "./unifiedReport.js";

test("unmeasured Fit is announced as unmeasured instead of zero", () => {
  assert.equal(fitAriaLabel({ measured: false, score: 0 }, "표정"), "표정 측정 안 됨");
  assert.equal(fitAriaLabel({ measured: true, score: 84 }, "표정"), "표정 84점");
});

test("issued code stays visible when clipboard is unavailable", async () => {
  const result = await saveAndShareReport({
    onIssueCode: async () => ({ code: "ABCD12" }),
    total: 88,
    navigatorObject: {},
    printPage: null,
  });

  assert.equal(result.method, "saved");
  assert.match(result.notice, /ABCD12/);
  assert.doesNotMatch(result.notice, /복사/);
});

test("issued code reports a copy only after clipboard succeeds", async () => {
  let copied = "";
  const result = await saveAndShareReport({
    onIssueCode: async () => ({ code: "SAVE88" }),
    total: 88,
    navigatorObject: { clipboard: { writeText: async (value) => { copied = value; } } },
    printPage: null,
  });

  assert.equal(copied, "SAVE88");
  assert.equal(result.method, "clipboard");
  assert.match(result.notice, /복사했어요/);
});

test("native share includes the saved code when available", async () => {
  let payload;
  const result = await saveAndShareReport({
    onIssueCode: async () => ({ code: "TEAM24" }),
    total: 91,
    navigatorObject: { share: async (nextPayload) => { payload = nextPayload; } },
    locationHref: "https://mirror.example/result",
    printPage: null,
  });

  assert.equal(result.method, "share");
  assert.match(payload.text, /TEAM24/);
  assert.equal(payload.url, "https://mirror.example/result");
});

test("print remains the final fallback without a saved code", async () => {
  let printed = false;
  const result = await saveAndShareReport({
    total: 72,
    navigatorObject: {},
    printPage: () => { printed = true; },
  });

  assert.equal(printed, true);
  assert.equal(result.method, "print");
});
