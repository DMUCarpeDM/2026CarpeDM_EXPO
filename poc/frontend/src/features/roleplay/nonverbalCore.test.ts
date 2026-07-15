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
  gazeZoneIndex,
  median,
  resolveGaze,
  resolveHeadDown,
  stdDev,
  trackerJumped,
  updateNod,
  verticalIrisRatio,
} from './nonverbalCore.ts';

const gazeInput = (over: Partial<Parameters<typeof resolveGaze>[0]> = {}) => ({
  signedAsym: null, eyeInHeadX: null, eyeInHeadY: null, eyeDown: 0, eyeUp: 0, ...over,
});

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
    cal.asym = [0.1, 0.1, 0.1];
    assert.equal(finalizeCalibration(cal).set, false);
  });

  it('중앙값으로 기준을 확정한다', () => {
    const cal = emptyCalibration();
    cal.asym = [0.1, 0.2, 0.3, 0.15];
    cal.tilt = [1, 2, 3, 4];
    const base = finalizeCalibration(cal);
    assert.equal(base.set, true);
    assert.equal(base.asym, 0.2);
    assert.equal(base.tilt, 3);
  });

  it('흔들리는 홍채 표본(분산 큼)은 기준으로 쓰지 않는다', () => {
    const cal = emptyCalibration();
    cal.asym = [0, 0, 0, 0];
    cal.eyeX = [-0.2, 0.2, -0.2, 0.2]; // stdDev 0.2 ≥ 0.08
    assert.equal(finalizeCalibration(cal).eyeX, null);
  });

  it('깜빡임 기저선은 10초(50프레임) 이상 표본에서만', () => {
    const cal = emptyCalibration();
    cal.asym = [0, 0, 0, 0];
    cal.blinkFrames = 49;
    cal.blinks = 5;
    assert.equal(finalizeCalibration(cal).blinkPerMin, null);
    cal.blinkFrames = 50; // 50프레임 × 200ms = 10초 → 분당 환산 ×6
    assert.equal(finalizeCalibration(cal).blinkPerMin, 30);
  });
});

describe('resolveGaze — 시선 판정', () => {
  it('얼굴 미추적이면 정면 유지(판정 보류)', () => {
    const r = resolveGaze(gazeInput(), emptyBaseline());
    assert.equal(r.front, true);
    assert.equal(r.gazeX, null);
  });

  it('절대 폴백: 캘리브레이션 없이 큰 비대칭은 이탈', () => {
    const r = resolveGaze(gazeInput({ signedAsym: 0.35 }), emptyBaseline());
    assert.equal(r.front, false);
    assert.equal(r.offDir, 'right');
  });

  it('기준 보정: 카메라 오프셋만큼의 비대칭은 정면', () => {
    const base = { ...emptyBaseline(), set: true, asym: 0.3 };
    const r = resolveGaze(gazeInput({ signedAsym: 0.35 }), base);
    assert.equal(r.front, true); // 델타 0.05 < 0.22
  });

  it('홍채 구제: 고개는 돌렸지만 눈이 카메라를 보면 정면', () => {
    const base = { ...emptyBaseline(), set: true, asym: 0, eyeX: 0 };
    const r = resolveGaze(gazeInput({ signedAsym: 0.25, eyeInHeadX: 0.25 }), base);
    // 보상 0.18(클램프) → 잔여 0.07 < 0.22 → 정면 구제
    assert.equal(r.front, true);
    assert.equal(r.irisUsed, true);
  });

  it('눈-단독 이탈: 머리는 정면인데 눈만 옆을 본다', () => {
    const base = { ...emptyBaseline(), set: true, asym: 0, eyeX: 0 };
    const r = resolveGaze(gazeInput({ signedAsym: 0.0, eyeInHeadX: 0.3 }), base);
    assert.equal(r.front, false);
    assert.equal(r.offDir, 'left');
  });

  it('수직 홍채: 기준 대비 아래 편향이면 down + 능력 플래그', () => {
    const base = { ...emptyBaseline(), set: true, asym: 0, eyeY: 0.5 };
    const r = resolveGaze(gazeInput({ signedAsym: 0, eyeInHeadY: 0.8 }), base);
    assert.equal(r.offDir, 'down');
    assert.equal(r.irisVUsed, true);
  });

  it('실눈 구제: blendshape가 높아도 홍채가 중앙이면 정면 유지', () => {
    const base = { ...emptyBaseline(), set: true, asym: 0, eyeY: 0.5 };
    const r = resolveGaze(gazeInput({ signedAsym: 0, eyeInHeadY: 0.5, eyeDown: 0.7 }), base);
    assert.equal(r.front, true);
  });

  it('blendshape 폴백: 홍채 기준이 없으면 eyeDown으로 down 판정', () => {
    const r = resolveGaze(gazeInput({ signedAsym: 0, eyeDown: 0.6 }), emptyBaseline());
    assert.equal(r.offDir, 'down');
    assert.equal(r.irisVUsed, false);
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

describe('gazeZoneIndex — 3×3 시선 존', () => {
  it('정중앙', () => assert.equal(gazeZoneIndex(0, null, 0, 0, false), 4));
  it('좌측 열', () => assert.equal(gazeZoneIndex(-0.2, null, 0, 0, false), 3));
  it('고개 숙임은 아래 행', () => assert.equal(gazeZoneIndex(0, null, 0, 0, true), 7));
  it('수직 홍채가 blendshape보다 우선한다', () => {
    // 홍채는 중앙이라는데 eyeUp이 높음 → 홍채를 믿고 중앙 행
    assert.equal(gazeZoneIndex(0, 0, 0.9, 0, false), 4);
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
    acc.frontFrames = 16;
    acc.gazeOffCount = 2;
    acc.maxOffStreak = 10; // × 200ms = 2.0s
    acc.offDirs.down = 4; // 표본 3+ → 지배 방향 인정
    acc.listenFrames = 9; // 표본 2초 미만 → 보류
    acc.answerFrames = 10;
    acc.answerFront = 5;
    const m = finalizeTurnMetrics(acc, emptyBaseline());
    assert.ok(m);
    assert.equal(m.front_gaze_ratio, 0.8);
    assert.equal(m.longest_off_sec, 2);
    assert.equal(m.gaze_off_dir, 'down');
    assert.equal(m.listening_front_ratio, null);
    assert.equal(m.answering_front_ratio, 0.5);
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
      { frames: 10, front: 5, press: 0, tiltSum: 20 },
      { frames: 0, front: 0, press: 0, tiltSum: 0 },
    ];
    const timeline = finalizeTurnMetrics(acc, emptyBaseline())!.timeline;
    assert.equal(timeline.length, 1);
    assert.deepEqual(timeline[0], { t: 0, front: 0.5, press: 0, tilt: 2 });
  });

  it('최장 연속 응시(아이컨택 스트릭)는 완료 바우트와 진행 중 스트릭의 최댓값', () => {
    const acc = emptyAcc();
    acc.frames = 40;
    acc.contactBouts = [10, 45]; // 완료 바우트: 2.0s, 9.0s
    acc.curContactStreak = 20; // 진행 중: 4.0s — 최댓값은 완료 바우트 9.0s
    assert.equal(finalizeTurnMetrics(acc, emptyBaseline())!.contact_streak_max_sec, 9);

    const ongoing = emptyAcc();
    ongoing.frames = 40;
    ongoing.curContactStreak = 30; // 턴 내내 유지 중인 스트릭도 인정 (× 200ms = 6.0s)
    assert.equal(finalizeTurnMetrics(ongoing, emptyBaseline())!.contact_streak_max_sec, 6);

    const none = emptyAcc();
    none.frames = 40; // 응시 성립 없음 → 0
    assert.equal(finalizeTurnMetrics(none, emptyBaseline())!.contact_streak_max_sec, 0);
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

describe('verticalIrisRatio — 눈 열림 게이트', () => {
  const eye = {
    inner: { x: 0.4, y: 0.5 }, outer: { x: 0.5, y: 0.5 },
    upper: { x: 0.45, y: 0.48 }, lower: { x: 0.45, y: 0.52 },
  };
  it('정중앙 홍채 = 0.5, 아래를 보면 1에 접근', () => {
    const center = verticalIrisRatio(
      { y: 0.5 }, eye.upper, eye.lower, eye.inner, eye.outer, 0.15,
    );
    assert.ok(Math.abs((center ?? 0) - 0.5) < 1e-6);
    const down = verticalIrisRatio(
      { y: 0.515 }, eye.upper, eye.lower, eye.inner, eye.outer, 0.15,
    );
    assert.ok((down ?? 0) > 0.8);
  });
  it('깜빡임(열림 < 눈 너비 15%)이면 표본을 버린다 — 오판 원천 차단', () => {
    const shutUpper = { x: 0.45, y: 0.495 };
    const shutLower = { x: 0.45, y: 0.505 };
    const r = verticalIrisRatio(
      { y: 0.5 }, shutUpper, shutLower, eye.inner, eye.outer, 0.15,
    );
    assert.equal(r, null);
  });
});
