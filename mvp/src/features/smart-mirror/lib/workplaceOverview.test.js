import test from "node:test";
import assert from "node:assert/strict";
import { sessionOverview } from "./workplaceOverview.js";

test("overview follows the session's selected scenes and characters, not catalog examples", () => {
  const session = {
    scenario: { characters: [{ id: "leader", name: "이팀장" }] },
    interaction: { overview: ["leaving", "morning", "work"].map((id) => ({
      category_id: id, character_id: "leader", title: `${id} 선택 장면`,
      opening_line: `${id} 실제 첫 대사`, situation: "실제 상황", goal: "실제 목표", virtual_time: "10:05",
    })) },
  };
  const scenes = sessionOverview(session);
  assert.deepEqual(scenes.map((scene) => scene.name), ["출근", "업무", "퇴근"]);
  assert.equal(scenes[1].title, "work 선택 장면");
  assert.equal(scenes[1].person, "이팀장");
  session.interaction.overview[2].opening_line = "다른 세션의 대사";
  assert.equal(sessionOverview(session)[1].line, "다른 세션의 대사");
});

test("missing or incomplete session overview blocks generic fallback", () => {
  assert.throws(() => sessionOverview(null), /시나리오 요약/);
  assert.throws(() => sessionOverview({ interaction: { overview: [{ category_id: "morning" }] } }), /시나리오 요약/);
});
