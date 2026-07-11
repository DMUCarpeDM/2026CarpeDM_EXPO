/** heroMoment 선택 로직 유닛 테스트 — node --test (의존성 없음).
 * 실행: npm test (frontend/).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Moment, kindLabel, sameMoment, selectHeroMoment } from './heroMoment.ts';

const m = (over: Partial<Moment> = {}): Moment => ({
  turn_order: 1, at_sec: 5, kinds: ['gaze'], composite: false,
  description: '설명', quote: null, pressure_context: false, ...over,
});

describe('selectHeroMoment', () => {
  it('빈/누락이면 null', () => {
    assert.equal(selectHeroMoment(undefined), null);
    assert.equal(selectHeroMoment(null), null);
    assert.equal(selectHeroMoment([]), null);
  });

  it('복합 순간을 최우선으로 고른다 (정렬 순서와 무관하게)', () => {
    const composite = m({ turn_order: 3, composite: true, kinds: ['gaze', 'tension'] });
    const hero = selectHeroMoment([m({ quote: '어…' }), composite]);
    assert.equal(hero, composite);
  });

  it('복합이 없으면 인용문 있는 순간을 고른다', () => {
    const quoted = m({ turn_order: 2, quote: '재발 방지는' });
    const hero = selectHeroMoment([m({ quote: null }), quoted]);
    assert.equal(hero, quoted);
  });

  it('복합도 인용도 없으면 null (밋밋한 세션엔 억지 히어로 없음)', () => {
    assert.equal(selectHeroMoment([m({ composite: false, quote: null })]), null);
  });
});

describe('kindLabel / sameMoment', () => {
  it('종류를 한국어 라벨로 (미지의 키는 그대로)', () => {
    assert.equal(kindLabel('gaze'), '시선 이탈');
    assert.equal(kindLabel('hesitation'), '긴 머뭇거림');
    assert.equal(kindLabel('unknown'), 'unknown');
  });

  it('sameMoment는 턴·시각으로 동일 판정', () => {
    assert.equal(sameMoment(m({ turn_order: 2, at_sec: 8 }), m({ turn_order: 2, at_sec: 8 })), true);
    assert.equal(sameMoment(m({ turn_order: 2, at_sec: 8 }), m({ turn_order: 2, at_sec: 9 })), false);
  });
});
