import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelSceneState, conversationSceneState, PIXEL_ACTOR_WIDTH } from './workplacePixelScene.js';
import { mirrorPhase } from './workplaceMirrorTimeline.js';
test('each scene moves left to right, stops while reading and exits without reversing', () => {
  for (const start of [2000,15000,28000]) {
    let previous = 0;
    for (let time = 0; time < 12000; time += 80) {
      const actor = pixelSceneState(mirrorPhase(start + time));
      assert.ok(actor.left >= previous && actor.left >= 8 && actor.left <= 92);
      previous = actor.left;
      if (time >= 2400 && time < 9600) assert.deepEqual(actor, {left:42,walking:false});
    }
  }
});
test('reduced motion, consent errors and overview stop the sprite', () => {
  const phase = mirrorPhase(3000);
  assert.deepEqual(pixelSceneState(phase,true), {left:42,walking:false});
  assert.deepEqual(pixelSceneState(phase,false,true), {left:42,walking:false});
  assert.equal(pixelSceneState(mirrorPhase(1000)).walking,false);
  assert.equal(pixelSceneState(mirrorPhase(40000)).walking,false);
});

test('anonymous arrivals remain distinct and stop for reduced motion or consent errors', async () => {
  const { anonymousSceneState } = await import('./workplacePixelScene.js');
  const phase = mirrorPhase(6000);
  const workers = [0,1,2].map(i => anonymousSceneState(phase,i));
  assert.equal(new Set(workers.map(w => w.left)).size,3);
  assert.equal(workers.filter(w => w.walking).length,1);
  assert.deepEqual(workers.slice(1).map(w=>w.left),[17,29]);
  assert.equal(anonymousSceneState(phase,0,true).walking,false);
  assert.equal(anonymousSceneState(phase,0,false,true).walking,false);
  assert.equal(pixelSceneState(mirrorPhase(43000)).left,82);
});

test('participant stops near each desk and speech appears only during the shared reading period', () => {
  for (const [start, desk] of [[2000,53],[15000,62],[28000,62]]) {
    const phase = mirrorPhase(start + 4800);
    const actor = pixelSceneState(phase,false,false,desk - 12);
    assert.equal(actor.left,desk - 12);
    assert.equal(actor.walking,false);
    assert.equal(PIXEL_ACTOR_WIDTH,10);
    assert.equal(conversationSceneState(phase,actor,desk).active,true);
    assert.equal(conversationSceneState(phase,actor,desk).speaker,'counterpart');
    const response = mirrorPhase(start + 7200);
    assert.equal(conversationSceneState(response,actor,desk).speaker,'participant');
    assert.equal(conversationSceneState(phase,{left:8,walking:false},desk).active,false);
    assert.equal(conversationSceneState(phase,actor,desk,false,true).active,false);
    assert.equal(conversationSceneState(phase,actor,desk,true).active,true);
    assert.equal(conversationSceneState(phase,actor,desk,true).animated,false);
    for(const time of [0,1200,10000,12000]) {
      const outside = mirrorPhase(start + time);
      const moving = pixelSceneState(outside,false,false,desk - 12);
      assert.equal(conversationSceneState(outside,moving,desk).active,false);
    }
  }
});
