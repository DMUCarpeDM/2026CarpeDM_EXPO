import test from "node:test";
import assert from "node:assert/strict";
import { mirrorPhase, createVisibleClock, hasCurrentCardConsent, isMirrorDeployment } from "./workplaceMirrorTimeline.js";
test("three scenes get twelve seconds and finish at 43 seconds", () => {
  for (const [time, scene, kind] of [[0,-1,"overview"],[2000,0,"scene"],[13999,0,"scene"],[14000,1,"move"],[15000,1,"scene"],[26999,1,"scene"],[27000,2,"move"],[28000,2,"scene"],[39999,2,"scene"],[40000,2,"countdown"],[43000,2,"complete"]]) {
    assert.equal(mirrorPhase(time).scene, scene); assert.equal(mirrorPhase(time).kind, kind);
  }
  assert.equal(mirrorPhase(40000).remaining, 3);
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
