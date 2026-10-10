/** nonverbalCore 유닛 테스트 — 판정 임계값·집계·직렬화의 회귀 방지.
 *
 * 실행: npm test (frontend/) — node --test, 의존성 없음 (Node 22.18+ 타입 스트리핑).
 * 여기 있는 기대값은 임계값 계약이다: 실기기 보정으로 상수를 바꾸면
 * 테스트도 함께 바꿔야 한다 — 그것이 의도된 마찰이다.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type Accumulator,
  emptyAcc,
  emptyBaseline,
  emptyCalibration,
  finalizeCalibration,
  finalizeTurnMetrics,
  framesFor,
  median,
  resolveHeadDown,
  stdDev,
  trackerJumped,
  updateNod,
} from './nonverbalCore.ts';

describe('통계 헬퍼', () => {
  it('median — 홀수는 중앙, 짝수는 상위 중앙', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 3);
  });
  it('stdDev — 동일 값은 0', () => {
    assert.equal(stdDev([2, 2, 2]), 0);
    assert.ok(Math.abs(stdDev([1, 3]) - 1) < 1e-9);
  });
});

describe('finalizeCalibration', () => {
  it('표본 4개 미만이면 기준 미설정(절대 판정 유지)', () => {
    const cal = emptyCalibration();
    cal.tilt = [1, 2, 3];
    assert.equal(finalizeCalibration(cal).set, false);
  });

  it('중앙값으로 기준을 확정한다', () => {
    const cal = emptyCalibration();
    cal.tilt = [1, 2, 3, 4];
    const base = finalizeCalibration(cal);
    assert.equal(base.set, true);
    assert.equal(base.tilt, 3);
  });

  it('깜빡임 기저선은 10초(50프레임) 이상 표본에서만', () => {
    const cal = emptyCalibration();
    cal.tilt = [0, 0, 0, 0];
    cal.blinkFrames = 49;
    cal.blinks = 5;
    assert.equal(finalizeCalibration(cal).blinkPerMin, null);
    cal.blinkFrames = 50; // 50프레임 × 200ms = 10초 → 분당 환산 ×6
    assert.equal(finalizeCalibration(cal).blinkPerMin, 30);
  });
});

describe('resolveHeadDown', () => {
  it('기준 보정: 코-어깨 거리가 기준보다 0.1 넘게 줄면 숙임', () => {
    const base = { ...emptyBaseline(), set: true, headGap: 0.5 };
    assert.equal(resolveHeadDown(0.35, base), true);
    assert.equal(resolveHeadDown(0.45, base), false);
  });
  it('절대 폴백: 캘리브레이션 없으면 0.3 미만이 숙임', () => {
    assert.equal(resolveHeadDown(0.25, emptyBaseline()), true);
    assert.equal(resolveHeadDown(0.35, emptyBaseline()), false);
    assert.equal(resolveHeadDown(null, emptyBaseline()), false);
  });
});

describe('updateNod — 끄덕임 근사', () => {
  function feed(acc: Accumulator, gaps: number[]) {
    for (const g of gaps) updateNod(acc, g);
  }

  it('진폭 게이트를 넘는 상하 반전만 센다 (내림+올림 = 1회)', () => {
    const acc = emptyAcc();
    feed(acc, [0.5, 0.56, 0.5, 0.56]); // 진폭 0.06 스윙 3회 → 반전 2회
    assert.equal(acc.nodReversals, 2);
  });

  it('지터(0.005 이하)와 소진폭 스윙은 무시한다', () => {
    const acc = emptyAcc();
    feed(acc, [0.5, 0.503, 0.5, 0.503]); // 지터 수준
    assert.equal(acc.nodReversals, 0);
    const acc2 = emptyAcc();
    feed(acc2, [0.5, 0.52, 0.5, 0.52]); // 진폭 0.02 < 0.04
    assert.equal(acc2.nodReversals, 0);
  });
});

describe('finalizeTurnMetrics — 턴 직렬화', () => {
  it('표본 5프레임 미만이면 측정 보류(null)', () => {
    const acc = emptyAcc();
    acc.frames = 4;
    assert.equal(finalizeTurnMetrics(acc, emptyBaseline()), null);
  });

  it('핵심 비율과 보류 규칙을 지킨다', () => {
    const acc = emptyAcc();
    acc.frames = 20;
    acc.listenFrames = 9; // 표본 2초 미만 → 보류
    acc.answerFrames = 10;
    acc.torsoSamples = 20;
    acc.hunchedFrames = 8;
    acc.leanBackFrames = 4;
    const m = finalizeTurnMetrics(acc, emptyBaseline());
    assert.ok(m);
    assert.equal(m.hunched_ratio, 0.4);
    assert.equal(m.lean_back_ratio, 0.2);
    assert.equal(m.calibrated, false);
  });

  it('듣기 리닝은 기준 어깨폭과 2초 표본이 있어야 계산한다', () => {
    const acc = emptyAcc();
    acc.frames = 20;
    acc.listenWidths = Array(10).fill(0.55);
    assert.equal(finalizeTurnMetrics(acc, emptyBaseline())!.listen_lean_pct, null);
    const base = { ...emptyBaseline(), width: 0.5 };
    assert.equal(finalizeTurnMetrics(acc, base)!.listen_lean_pct, 10); // +10% 전진
  });

  it('타임라인은 빈 프레임 없는 빈을 걸러낸다', () => {
    const acc = emptyAcc();
    acc.frames = 20;
    acc.bins = [
      { frames: 10, press: 0, tiltSum: 20 },
      { frames: 0, press: 0, tiltSum: 0 },
    ];
    const timeline = finalizeTurnMetrics(acc, emptyBaseline())!.timeline;
    assert.equal(timeline.length, 1);
    assert.deepEqual(timeline[0], { t: 0, press: 0, tilt: 2 });
  });

  it('시계축 정합: 답변 시작 오프셋을 페이로드로 내보낸다', () => {
    // moments가 비언어(턴 시계)와 음성 스팬(답변 시계)을 같은 축으로 합성할 근거
    const acc = emptyAcc();
    acc.frames = 20;
    acc.turnStartedAt = 1_000_000;
    acc.answerStartedAt = 1_012_300; // 12.3초 뒤 답변 시작
    const m = finalizeTurnMetrics(acc, emptyBaseline())!;
    assert.equal(m.answer_offset_sec, 12.3);
    assert.equal(m.sample_ms, 200);

    const noAnswer = emptyAcc();
    noAnswer.frames = 20;
    noAnswer.turnStartedAt = 1_000_000;
    assert.equal(finalizeTurnMetrics(noAnswer, emptyBaseline())!.answer_offset_sec, null);
  });
});

describe('표현 동작 확장 ⑤ — 표정 생동감·제스처 크기/양손·머리 흔들림', () => {
  it('눈썹 표현력은 올림 프레임 비율 (항상 계산, 감점 아님)', () => {
    const acc = emptyAcc();
    acc.frames = 20;
    acc.browRaiseFrames = 10;
    assert.equal(finalizeTurnMetrics(acc, emptyBaseline())!.brow_raise_ratio, 0.5);
  });

  it('제스처 크기는 표본 5초 미만이면 보류, 충분하면 cm로 계산', () => {
    const short = emptyAcc();
    short.frames = 20;
    short.gestureReachSamples = 24; // framesFor(5000)=25 미만
    short.gestureReachSum = 24 * 0.3;
    assert.equal(finalizeTurnMetrics(short, emptyBaseline())!.gesture_amplitude, null);

    const acc = emptyAcc();
    acc.frames = 40;
    acc.gestureReachSamples = 30;
    acc.gestureReachSum = 30 * 0.3; // 평균 0.3m → 30cm
    assert.equal(finalizeTurnMetrics(acc, emptyBaseline())!.gesture_amplitude, 30);
  });

  it('양손 제스처는 손 활동 3초 미만이면 보류, 충분하면 비율', () => {
    const short = emptyAcc();
    short.frames = 20;
    short.handActiveFrames = 14; // framesFor(3000)=15 미만
    short.twoHandFrames = 7;
    assert.equal(finalizeTurnMetrics(short, emptyBaseline())!.gesture_two_handed_ratio, null);

    const acc = emptyAcc();
    acc.frames = 30;
    acc.handActiveFrames = 20;
    acc.twoHandFrames = 10; // 절반은 양손
    assert.equal(finalizeTurnMetrics(acc, emptyBaseline())!.gesture_two_handed_ratio, 0.5);
  });

  it('머리 흔들림은 답변 표본 3초 미만이면 보류, 충분하면 위치 표준편차', () => {
    const short = emptyAcc();
    short.frames = 20;
    short.headPosSamples = Array(14).fill({ x: 0, y: 0 });
    assert.equal(finalizeTurnMetrics(short, emptyBaseline())!.head_motion, null);

    const acc = emptyAcc();
    acc.frames = 30;
    // x는 ±0.1 교대(표준편차 0.1), y는 고정(0) → hypot(0.1, 0) = 0.1
    acc.headPosSamples = Array.from({ length: 20 }, (_, i) => ({ x: i % 2 ? 0.1 : -0.1, y: 0 }));
    assert.equal(finalizeTurnMetrics(acc, emptyBaseline())!.head_motion, 0.1);
  });
});

// ---------------------------------------------------------------------------
// 감사 패스 이식분 — 시간 기반 게이트·다인 가드·수직 홍채 (구 nonverbalMath 하네스)
// ---------------------------------------------------------------------------

describe('framesFor — 시간 기반 표본 게이트', () => {
  it('기본 200ms(5Hz)에서 시간→프레임 환산', () => {
    assert.equal(framesFor(1000), 5);
    assert.equal(framesFor(5000), 25);
    assert.equal(framesFor(10000), 50);
  });
  it('최소 1프레임을 보장한다', () => {
    assert.equal(framesFor(50), 1);
  });
});

describe('trackerJumped — 다인 가드 (자세·얼굴 공용)', () => {
  it('중심이 한 샘플에 크게 이동하면 발동', () => {
    assert.equal(trackerJumped({ x: 0.5, w: 0.3 }, 0.75, 0.3, 0.18, 1.6), true);
  });
  it('크기 급변(1.6배)에 발동 — 더 가까운 사람이 끼어든 경우', () => {
    assert.equal(trackerJumped({ x: 0.5, w: 0.3 }, 0.5, 0.52, 0.18, 1.6), true);
    assert.equal(trackerJumped({ x: 0.5, w: 0.3 }, 0.5, 0.17, 0.18, 1.6), true);
  });
  it('자연스러운 움직임·첫 프레임(기준 없음)에는 발동하지 않는다', () => {
    assert.equal(trackerJumped({ x: 0.5, w: 0.3 }, 0.55, 0.32, 0.18, 1.6), false);
    assert.equal(trackerJumped(null, 0.5, 0.3, 0.18, 1.6), false);
  });
});

it('미검출 프레임은 유효 자세 비율을 낮추지 않는다', () => {
  const acc = emptyAcc();
  acc.frames = 40;
  acc.headSamples = 40;
  acc.headDownFrames = 40;
  acc.torsoSamples = 20;
  acc.hunchedFrames = 10;
  acc.leanBackFrames = 10;
  const before = finalizeTurnMetrics(acc, emptyBaseline())!;
  acc.frames += 160;
  const after = finalizeTurnMetrics(acc, emptyBaseline())!;
  assert.equal(after.head_down_ratio, 1);
  assert.equal(after.hunched_ratio, .5);
  assert.equal(after.lean_back_ratio, .5);
  assert.equal(after.head_down_ratio, before.head_down_ratio);
  assert.deepEqual(after.posture_samples, before.posture_samples);
});

it('얼굴 미검출이어도 모델용 자세 표본은 전달한다', () => {
  const acc=emptyAcc();
  acc.poseFeatures=Array.from({length:40},()=>Array(27).fill(0));
  const result=finalizeTurnMetrics(acc,emptyBaseline())!;
  assert.equal(result.frames,0);
  assert.equal(result.pose_ensemble?.features.length,40);
});
