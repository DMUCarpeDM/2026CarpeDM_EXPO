import assert from "node:assert/strict";
import test from "node:test";
import { workplaceCategories } from "../data/workplaceStories.js";
import { isWorkplaceSession, workplaceBriefing, workplaceStartView, WORKPLACE_SCENARIO_SLUG } from "./workplaceTrack.js";

test("workplace skips role selection and starts from preview", () => {
  assert.equal(workplaceStartView("workplace"), "preview");
  assert.equal(workplaceStartView("interview"), "role");
  assert.equal(workplaceStartView("training"), "role");
});

test("workplace briefing is exposed only during an active workplace session", () => {
  const briefing = { step: 2, total: 12, situation: "상황", tip: "팁", category_label: "업무" };
  assert.deepEqual(workplaceBriefing({ mode: "workplace", briefing }), briefing);
  assert.deepEqual(workplaceBriefing({ mode: "workplace_continuous", briefing }), briefing);
  assert.equal(workplaceBriefing({ mode: "training", briefing }), null);
  assert.equal(isWorkplaceSession({ interaction: { mode: "workplace" } }), true);
  assert.equal(isWorkplaceSession({ interaction: { mode: "workplace_continuous" } }), true);
  assert.equal(isWorkplaceSession({ scenario: { slug: WORKPLACE_SCENARIO_SLUG } }), true);
  assert.equal(workplaceCategories.length, 3);
  assert.deepEqual(workplaceCategories.map((item) => item.label), ["출근", "업무", "퇴근"]);
});
