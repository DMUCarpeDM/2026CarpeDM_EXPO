/** 비언어 판정 코어의 행동 테스트 — 프론트 측정 로직의 첫 자동 검증.
 *
 * 원칙 검증: 진폭 게이트 미달은 끄덕임이 아니고, 지터는 방향 반전이 아니며,
 * 눈 열림이 무너지면 표본 자체를 버린다 (오판 억제 — 백엔드 하네스와 동일 사상).
 */
import { describe, expect, it } from 'vitest';
import {
  framesFor, median, stdDev, trackerJumped, updateNod, verticalIrisRatio,
  type NodState,
} from './nonverbalMath';

function nodState(): NodState {
  return { nodPrevGap: null, nodDir: 0, nodSwing: 0, nodReversals: 0 };
}

function feed(state: NodState, gaps: number[]) {
  for (const g of gaps) updateNod(state, g, 0.04, 0.005);
  return state;
}

describe('framesFor — 시간 기반 게이트', () => {
  it('샘플링 주기가 달라도 같은 시간을 가리킨다', () => {
    expect(framesFor(1000, 200)).toBe(5);
    expect(framesFor(1000, 100)).toBe(10);
    expect(framesFor(5000, 200)).toBe(25);
  });
  it('최소 1프레임을 보장한다', () => {
    expect(framesFor(50, 200)).toBe(1);
  });
});

describe('updateNod — 끄덕임 반전 계수', () => {
  it('또렷한 내림+올림 = 반전 2회 (끄덕임 1회)', () => {
    // headGap 감소 = 고개 내림. 0.06 진폭 왕복 두 번
    const s = feed(nodState(), [0.5, 0.44, 0.5, 0.44, 0.5]);
    expect(Math.floor(s.nodReversals / 2)).toBeGreaterThanOrEqual(1);
  });
  it('진폭 게이트(4% 어깨너비) 미달의 흔들림은 세지 않는다', () => {
    const s = feed(nodState(), [0.5, 0.48, 0.5, 0.48, 0.5, 0.48]);
    expect(s.nodReversals).toBe(0); // 0.02 진폭 — 게이트 미달
  });
  it('지터(0.005 이하)는 방향 반전으로 취급하지 않는다', () => {
    const s = feed(nodState(), [0.5, 0.503, 0.499, 0.502, 0.5, 0.503]);
    expect(s.nodReversals).toBe(0);
  });
  it('한 방향으로만 내려가는 고개 숙임은 끄덕임이 아니다', () => {
    const s = feed(nodState(), [0.5, 0.46, 0.42, 0.38, 0.34]);
    expect(s.nodReversals).toBe(0);
  });
});

describe('trackerJumped — 다인 가드', () => {
  it('중심이 한 샘플에 크게 이동하면 발동', () => {
    expect(trackerJumped({ x: 0.5, w: 0.3 }, 0.75, 0.3, 0.18, 1.6)).toBe(true);
  });
  it('크기가 급변(1.6배)하면 발동 — 더 가까운 사람이 끼어든 경우', () => {
    expect(trackerJumped({ x: 0.5, w: 0.3 }, 0.5, 0.52, 0.18, 1.6)).toBe(true);
    expect(trackerJumped({ x: 0.5, w: 0.3 }, 0.5, 0.17, 0.18, 1.6)).toBe(true);
  });
  it('자연스러운 움직임에는 발동하지 않는다', () => {
    expect(trackerJumped({ x: 0.5, w: 0.3 }, 0.55, 0.32, 0.18, 1.6)).toBe(false);
  });
  it('첫 프레임(기준 없음)은 발동하지 않는다', () => {
    expect(trackerJumped(null, 0.5, 0.3, 0.18, 1.6)).toBe(false);
  });
});

describe('verticalIrisRatio — 눈 열림 게이트', () => {
  const eye = {
    inner: { x: 0.4, y: 0.5 }, outer: { x: 0.5, y: 0.5 },
    upper: { x: 0.45, y: 0.48 }, lower: { x: 0.45, y: 0.52 },
  };
  it('정중앙 홍채 = 0.5', () => {
    const r = verticalIrisRatio(
      { x: 0.45, y: 0.5 }, eye.upper, eye.lower, eye.inner, eye.outer, 0.15,
    );
    expect(r).toBeCloseTo(0.5, 5);
  });
  it('아래를 보면 1에 접근한다', () => {
    const r = verticalIrisRatio(
      { x: 0.45, y: 0.515 }, eye.upper, eye.lower, eye.inner, eye.outer, 0.15,
    );
    expect(r).toBeGreaterThan(0.8);
  });
  it('깜빡임(열림 < 눈 너비 15%)이면 표본을 버린다 — 오판 원천 차단', () => {
    const r = verticalIrisRatio(
      { x: 0.45, y: 0.5 },
      { x: 0.45, y: 0.495 }, { x: 0.45, y: 0.505 },  // 열림 0.01 < 0.1×0.15
      eye.inner, eye.outer, 0.15,
    );
    expect(r).toBeNull();
  });
});

describe('통계 유틸', () => {
  it('median·stdDev 기본 계약', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(stdDev([2, 2, 2, 2])).toBe(0);
    expect(stdDev([1, 3])).toBeCloseTo(1, 5);
  });
});
