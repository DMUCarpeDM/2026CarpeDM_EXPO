import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadSetupCatalog({ includeServiceModeCatalog = false } = {}) {
  const source = readFileSync(new URL("../data/setupCatalog.js", import.meta.url), "utf8")
    .replace(/^import\s+(\w+)\s+from\s+"[^"]+";$/gm, 'const $1 = "$1";')
    .replace(/export\s+(?=(?:const|function)\s)/g, "");
  const catalogExports = includeServiceModeCatalog ? ", serviceModes, validateServiceModes" : "";
  return new Function(`${source}\nreturn { getRoleScenarioOptions${catalogExports} };`)();
}

test("getRoleScenarioOptions keeps role and mode filtering behavior", () => {
  // Given: matching and non-matching roles with episodes for two modes.
  const { getRoleScenarioOptions } = loadSetupCatalog();
  const scenarios = [
    {
      job_role: "office_admin",
      slug: "release-schedule-alignment",
      title: "출시 일정 조율",
      characters: [{ id: "team-lead", name: "팀장" }],
      episodes: [
        { id: 1, character_id: "team-lead", title: "킥오프", situation: "월요일 09:00. 일정을 맞춰요", modes: [5] },
        { id: 2, character_id: "team-lead", title: "다른 모드", situation: "화요일 10:00. 제외해요", modes: [10] },
      ],
    },
    {
      job_role: "cafe_crew",
      slug: "ondo-cafe-crew",
      title: "카페 응대",
      episodes: [{ id: 3, character_id: "guest", title: "다른 직무", situation: "수요일 11:00. 제외해요", modes: [5] }],
    },
  ];

  // When: options are requested for the office role in the default mode.
  const options = getRoleScenarioOptions(scenarios, "office_admin");

  // Then: only the matching role/mode remains, with the existing mapped shape.
  assert.deepEqual(options, [{
    id: "release-schedule-alignment-team-lead-킥오프",
    scenarioSlug: "release-schedule-alignment",
    scenarioTitle: "출시 일정 조율",
    episodeId: 1,
    title: "킥오프",
    description: "일정을 맞춰요",
    character: { id: "team-lead", name: "팀장" },
  }]);
});

const REQUIRED_SERVICE_MODE_FIELDS = [
  "id",
  "label",
  "description",
  "detail",
  "icon",
  "tone",
  "setupTitle",
  "setupDescription",
  "scenarioDescription",
  "emptyScenarioMessage",
  "previewEyebrow",
];

test("service mode catalog keeps stable order, complete fields, and supported visual keys", () => {
  // Given: the shared service-mode catalog.
  const { serviceModes } = loadSetupCatalog({ includeServiceModeCatalog: true });

  // When: its stable IDs and entry fields are inspected.
  const ids = serviceModes.map((mode) => mode.id);

  // Then: display order and every field remain part of the catalog contract.
  assert.deepEqual(ids, ["interview", "training", "workplace"]);
  assert.equal(Object.isFrozen(serviceModes), true);
  for (const mode of serviceModes) {
    assert.equal(Object.isFrozen(mode), true);
    assert.deepEqual(Object.keys(mode).sort(), [...REQUIRED_SERVICE_MODE_FIELDS].sort());
    for (const field of REQUIRED_SERVICE_MODE_FIELDS) {
      assert.equal(typeof mode[field], "string", `${mode.id}.${field} is a string`);
      assert.ok(mode[field].trim(), `${mode.id}.${field} is not empty`);
    }
    assert.ok(["interview", "coach", "meeting"].includes(mode.icon), `${mode.id} uses an IconGlyph key`);
    assert.ok(["blue", "sky", "accent", "danger"].includes(mode.tone), `${mode.id} uses a setup tone`);
  }
});

test("service mode validation rejects invalid state without mutating fixture or catalog", () => {
  // Given: a copy of the catalog with one unsupported icon key.
  const { serviceModes, validateServiceModes } = loadSetupCatalog({ includeServiceModeCatalog: true });
  const invalidFixture = serviceModes.map((mode) => ({ ...mode }));
  invalidFixture[1].icon = "not-an-icon";
  invalidFixture[0].label = "stale fixture value";
  const invalidFixtureSnapshot = structuredClone(invalidFixture);

  // When: the invalid fixture is validated, then callers try to mutate the exported catalog.
  // Then: validation rejects without rewriting the fixture, and frozen exports reject both mutations.
  assert.throws(() => validateServiceModes(invalidFixture), /icon/);
  assert.deepEqual(invalidFixture, invalidFixtureSnapshot);
  assert.throws(() => {
    serviceModes[0].label = "mutated export";
  }, TypeError);
  assert.throws(() => {
    serviceModes.push(invalidFixture[0]);
  }, TypeError);
});
