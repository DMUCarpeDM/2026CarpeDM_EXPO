import test from "node:test";
import assert from "node:assert/strict";
import {
  JOB_ROLES,
  advanceTapCursor,
  findJobRole,
  isValidUid,
  jobRoleLabel,
  scenarioSlugForJobRole,
} from "./nfc.js";

test("job role catalog matches the backend default scenario packs", () => {
  // 백엔드 DEFAULT_PACK_BY_ROLE(app/api/nfc.py)과 계약이 어긋나면 발급 카드가 엉뚱한 시나리오로 시작된다.
  assert.equal(JOB_ROLES.length, 3);
  assert.equal(scenarioSlugForJobRole("cafe_crew"), "ondo-cafe-crew");
  assert.equal(scenarioSlugForJobRole("cs_agent"), "ondo-cs-agent");
  assert.equal(scenarioSlugForJobRole("office_admin"), "release-schedule-alignment");
  assert.equal(scenarioSlugForJobRole("unknown"), "");
  assert.equal(jobRoleLabel("cafe_crew"), "카페 파트너");
  assert.equal(jobRoleLabel("mystery_role"), "mystery_role");
  assert.equal(findJobRole("nope"), null);
});

test("advanceTapCursor only fires on a genuinely new tap", () => {
  // 새 태그 없음(uid 빈 문자열) — 커서 유지, 발화 없음
  assert.deepEqual(advanceTapCursor(3, { seq: 0, uid: "", reader: "kiosk", at: 0 }), { since: 3, tap: null });
  // 새 태그 — 커서 전진 + tap 반환
  const tap = { seq: 4, uid: "04AABBCC", reader: "kiosk", at: 1_000 };
  assert.deepEqual(advanceTapCursor(3, tap), { since: 4, tap });
  // 과거·중복 seq — 무시 (같은 카드를 두 번 발급하지 않는다)
  assert.deepEqual(advanceTapCursor(4, { seq: 4, uid: "04AABBCC" }), { since: 4, tap: null });
  assert.deepEqual(advanceTapCursor(9, { seq: 5, uid: "04AABBCC" }), { since: 9, tap: null });
  // 응답 자체가 없을 때(네트워크 오류 폴백)도 안전
  assert.deepEqual(advanceTapCursor(2, null), { since: 2, tap: null });
});

test("isValidUid mirrors the backend NfcIssueIn pattern", () => {
  assert.equal(isValidUid("04AABBCCDD"), true);
  assert.equal(isValidUid("04:aa:bb:cc"), true);
  assert.equal(isValidUid("04-AA-BB-CC"), true);
  assert.equal(isValidUid("  04AABB  "), true); // 앞뒤 공백은 다듬어 판정
  assert.equal(isValidUid("abc"), false); // 4자 미만
  assert.equal(isValidUid("Z4AABBCC"), false); // 16진수 아님
  assert.equal(isValidUid(""), false);
  assert.equal(isValidUid("A".repeat(33)), false); // 32자 초과
});
