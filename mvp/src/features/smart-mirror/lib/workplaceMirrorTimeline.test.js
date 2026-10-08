import test from "node:test";
import assert from "node:assert/strict";
import { mirrorPhase, createVisibleClock, hasCurrentCardConsent, isMirrorDeployment } from "./workplaceMirrorTimeline.js";
test("each scene has eighteen seconds before the final start countdown", () => {
  for (const [time, scene, kind] of [[0,0,"scene"],[17999,0,"scene"],[18000,1,"scene"],[35999,1,"scene"],[36000,2,"scene"],[53999,2,"scene"],[54000,2,"countdown"],[57000,2,"complete"]]) {
    assert.equal(mirrorPhase(time).scene, scene); assert.equal(mirrorPhase(time).kind, kind);
  }
  assert.equal(mirrorPhase(54000).remaining, 3);
  assert.equal(mirrorPhase(56000).remaining, 1);
});
test("progress stays complete during countdown and never runs backwards within a scene", () => {
  for (let scene = 0; scene < 3; scene++) {
    let previous = 0;
    for (let time = scene * 18000; time < (scene + 1) * 18000; time += 80) {
      const current = mirrorPhase(time).progress;
      assert.ok(current >= previous && current <= 1);
      previous = current;
    }
  }
  assert.equal(mirrorPhase(54000).progress, 1);
  assert.equal(mirrorPhase(56999).progress, 1);
});
test("hidden time does not shorten the reading period", () => {
  const clock = createVisibleClock(100);
  assert.equal(clock.tick(1100, false), 1000);
  assert.equal(clock.tick(60100, true), 1000);
  assert.equal(clock.tick(61100), 2000);
});
test("old and unconsented cards cannot automatically start", () => {
  assert.equal(hasCurrentCardConsent({uid:"ABCD",issued_count:2}), false);
  assert.equal(hasCurrentCardConsent({uid:"ABCD",issued_count:2,consent_agreed:true}), false);
  assert.equal(hasCurrentCardConsent({uid:"ABCD",issued_count:2,consent_agreed:true,consent_agreed_at:"2026-10-06"}), true);
  assert.equal(isMirrorDeployment("?mirror=1&service=workplace"), true);
  assert.equal(isMirrorDeployment("?mirror=1&service=interview"), false);
});
