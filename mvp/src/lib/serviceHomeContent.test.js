import assert from "node:assert/strict";
import test from "node:test";
import { resolveServiceHomeContent, serviceHomeContent } from "../data/serviceHomeContent.js";

const EXPECTED_VALUES = {
  interview: "실전 압박·질문 대응",
  training: "과업 수행·코칭",
  workplace: "협업·보고·피드백",
};

const EXPECTED_CTAS = {
  interview: "면접 상황 고르기",
  training: "훈련 상황 고르기",
  workplace: "대화 상황 고르기",
};

const EXISTING_HOME_BENEFIT_TITLES = [
  "실감나는\nAI 역할극",
  "상세한\n맞춤 리포트",
  "비교하고\n더 나아지기",
  "성장 기록으로\n한눈에 확인",
  "자신감 있는\n커뮤니케이션",
];

const EXISTING_HOME_FIT_LABELS = [
  "응답 (Response-Fit)",
  "목소리 (Voice-Fit)",
  "표정 (Expression-Fit)",
  "자세 (Posture-Fit)",
];

const modeIds = ["interview", "training", "workplace"];

test("selected-mode home registry keeps the exact three-mode content contract", () => {
  // Given: the frontend-only registry and the existing shared home content.
  // When: each supported mode record is inspected.
  // Then: IDs, copy, Korean context, tone, and content references are complete.
  assert.deepEqual(Object.keys(serviceHomeContent), modeIds);

  for (const id of modeIds) {
    const content = serviceHomeContent[id];
    assert.equal(content.id, id);
    assert.equal(content.value, EXPECTED_VALUES[id]);
    assert.equal(content.primaryCta, EXPECTED_CTAS[id]);
    assert.match(content.hero, /[가-힣]/);
    assert.ok(content.hero.trim());
    assert.ok(content.recommendationContext.trim());
    assert.ok(content.tone.trim());
    assert.ok(Array.isArray(content.benefitOrder));
    assert.ok(Array.isArray(content.fitOrder));
    assert.deepEqual(
      [...content.benefitOrder].sort(),
      [...EXISTING_HOME_BENEFIT_TITLES].sort(),
    );
    assert.deepEqual(
      [...content.fitOrder].sort(),
      [...EXISTING_HOME_FIT_LABELS].sort(),
    );
  }

  assert.equal(new Set(modeIds.map((id) => serviceHomeContent[id].tone)).size, modeIds.length);
  assert.equal(new Set(modeIds.map((id) => serviceHomeContent[id].benefitOrder.join("|"))).size, modeIds.length);
  assert.equal(new Set(modeIds.map((id) => serviceHomeContent[id].fitOrder.join("|"))).size, modeIds.length);
});

test("resolver returns the selected record and workplace for missing or invalid IDs", () => {
  // Given: supported, missing, and invalid service-mode IDs.
  // When: the frontend resolver is called for each lookup.
  // Then: valid IDs resolve directly and every invalid boundary input falls back to workplace.
  assert.strictEqual(resolveServiceHomeContent("interview"), serviceHomeContent.interview);
  assert.strictEqual(resolveServiceHomeContent("training"), serviceHomeContent.training);
  assert.strictEqual(resolveServiceHomeContent("workplace"), serviceHomeContent.workplace);
  assert.strictEqual(resolveServiceHomeContent(), serviceHomeContent.workplace);
  assert.strictEqual(resolveServiceHomeContent("invalid"), serviceHomeContent.workplace);
  assert.strictEqual(resolveServiceHomeContent("toString"), serviceHomeContent.workplace);
  assert.strictEqual(resolveServiceHomeContent(null), serviceHomeContent.workplace);
});

test("registry and records stay frozen after invalid lookups", () => {
  // Given: a snapshot of the exported registry.
  const snapshot = structuredClone(serviceHomeContent);

  // When: callers perform missing/invalid lookups and attempt mutation.
  resolveServiceHomeContent(undefined);
  resolveServiceHomeContent("stale-mode");

  // Then: fallback lookup does not change registry state, and frozen exports reject mutation.
  assert.deepEqual(serviceHomeContent, snapshot);
  assert.equal(Object.isFrozen(serviceHomeContent), true);
  for (const id of modeIds) {
    assert.equal(Object.isFrozen(serviceHomeContent[id]), true);
    assert.equal(Object.isFrozen(serviceHomeContent[id].benefitOrder), true);
    assert.equal(Object.isFrozen(serviceHomeContent[id].fitOrder), true);
  }
  assert.throws(() => {
    serviceHomeContent.workplace = serviceHomeContent.interview;
  }, TypeError);
});
