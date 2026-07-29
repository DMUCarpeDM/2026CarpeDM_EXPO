/** 비언어 턴 집계의 순수 로직 — 누적기·직렬화 (poc nonverbalCore.ts의 MVP 이식본).
 *
 * 이 파일에는 브라우저 API(카메라·MediaPipe·캔버스)가 없다. 훅이 뽑아준 프레임
 * 사실만 받아 누적하고, 턴 종료 시 서버 NonverbalIn 페이로드로 직렬화한다.
 * 임계값·표본 게이트가 전부 여기 모여 있으므로 node --test로 회귀를 잡는다.
 *
 * 경량 이식 과정에서 누락됐던 지표를 복원한다:
 *   posture_sway · tilt_drift_deg · 듣기/말하기 응시 분리 · 응시 리듬(바우트)
 * 서버(app/ai/nonverbal.py)는 이 값들을 전제로 밴드가 잡혀 있고, 보내지 않으면
 * Pydantic 기본값 0.0이 들어가 band_score가 만점을 준다(= 채점되지 않는 가중치).
 */

// 측정 샘플링 주기(ms) — useFaceTracking의 setInterval 주기와 반드시 일치해야 한다.
// 서버는 sample_ms로 프레임 수를 시간으로 환산한다.
export const SAMPLE_MS = 80;

/** 시간 길이(ms) → 표본 게이트 프레임 수 — 샘플링 주기가 바뀌어도 같은 시간 기준 */
export const framesFor = (ms) => Math.max(1, Math.round(ms / SAMPLE_MS));

// 답변 개시 직후의 짧은 시선 회피(생각 정리)는 인지적으로 정상 행동 —
// 서버가 ONSET_FORGIVENESS_CAP(2초)까지 최장 이탈에서 면제할 근거를 만든다.
export const ONSET_GRACE_MS = 2500;
// 고개 숙임: 기준 대비 코-어깨 수직거리(어깨너비 정규화) 감소량
export const HEAD_DROP_THRESHOLD = 0.1;
// 캘리브레이션 기준이 없을 때의 절대 폴백
export const HEAD_DOWN_ABS_THRESHOLD = 0.3;
// 전/후반 추세(드리프트) 판정 최소 표본 — 전·후반 각 1초씩
export const DRIFT_MIN_MS = 2000;
// 듣기/말하기 응시율·응시 리듬의 판정 보류 기준
export const SPLIT_MIN_MS = 2000;
// 교차 분석 타임라인 빈 폭·상한 (poc nonverbalCore와 동일 계약 — 서버 moments 입력)
export const TIMELINE_BIN_MS = 2000;
export const TIMELINE_MAX_BINS = 120; // 4분 상한 — 페이로드 폭주 방지

// ---- 표정 판정 (ARKit blendshape → FACS Action Unit) ----
// 무표정 기저값은 사람마다 다르다. 입꼬리가 올라간 사람은 가만히 있어도 mouthSmile이
// 0.4를 넘고, 눈썹이 낮은 사람은 상시 browDown 판정을 받는다. 시선 판정에는 이미
// 자동 캘리브레이션이 들어가 있는데(useFaceTracking의 base) 표정에는 빠져 있었다 —
// "절대 임계는 상시 오판을 만든다"는 같은 교훈이 적용되지 않은 축이다.
//
// 기준이 잡히면 "남은 표현 여지(1 - 기준) 대비 얼마나 움직였나"로 판정한다.
// 단순 차이(raw - base)로는 기저값이 높은 사람이 blendshape 상한(1.0)에 막혀
// 임계값에 영영 도달하지 못한다.
//
// DELTA 값은 각 ABS에서 통상적인 무표정 기저(~0.05)를 뺀 값이라, 기저가 평범한
// 사람에게는 기존과 거의 같게 동작하고 치우친 사람만 교정된다.
// 임계값 자체는 실기기 보정 항목(demo-checklist §2.5).
export const SMILE_ABS = 0.35; // AU12 입꼬리 당김 (대관골근)
export const SMILE_DELTA = 0.3;
export const SQUINT_ABS = 0.35; // AU6+AU7 눈둘레근 — 뒤셴(진정성) 판별용
export const SQUINT_DELTA = 0.3;
export const PRESS_ABS = 0.45; // AU23/24 입술 압축 (긴장 억제)
export const PRESS_DELTA = 0.4;
export const BROW_DOWN_ABS = 0.5; // AU4 미간 찌푸림 (긴장·집중·불만)
export const BROW_DOWN_DELTA = 0.45;
export const BROW_RAISE_ABS = 0.4; // AU1+AU2 눈썹 올림 (경청·강조 — 표정 생동감)
export const BROW_RAISE_DELTA = 0.35;
// 미소 표본이 이보다 적으면 뒤셴 비율을 판정하지 않는다(null)
export const DUCHENNE_MIN_MS = 2000;

/** 표정 판정 — 개인 기준이 있으면 남은 표현 여지 대비 변화량, 없으면 절대 폴백.
 *
 * @param raw            blendshape 원시 평균 (0~1)
 * @param base           무표정 기저값 (캘리브레이션 중앙값). null이면 절대 판정
 * @param absThreshold   기준이 없을 때의 절대 임계
 * @param deltaThreshold 기준이 있을 때의 정규화 변화량 임계
 */
export function resolveExpression(raw, base, absThreshold, deltaThreshold) {
  if (base === null || base === undefined) return raw > absThreshold;
  return (raw - base) / Math.max(1 - base, 1e-6) > deltaThreshold;
}

export function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values) {
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** 고개 숙임 — 기준이 있으면 코-어깨 거리 감소량, 없으면 절대 폴백.
 *
 * 주의: 이전 MVP는 eyeLookDown blendshape(=눈동자 하향)로 이 값을 채웠다.
 * 고개 각도와 안구 방향은 다른 물리량이라 Posture-Fit이 잘못된 신호를 받았다.
 */
export function resolveHeadDown(headGap, baseHeadGap) {
  if (headGap === null || headGap === undefined) return false;
  return baseHeadGap === null || baseHeadGap === undefined
    ? headGap < HEAD_DOWN_ABS_THRESHOLD
    : baseHeadGap - headGap > HEAD_DROP_THRESHOLD;
}

export const makeTurnAcc = () => ({
  frames: 0,
  front: 0,
  offCount: 0,
  lastFront: true,
  curOffStreak: 0,
  maxOffStreak: 0,
  // 응시 리듬 — 완료된 연속 응시 구간(바우트) 길이들 (프레임)
  contactBouts: [],
  curContactStreak: 0,
  // 듣기(상대 TTS) / 말하기(내 답변) 분리 — 커뮤니케이션에서 다른 역량이다
  listenFrames: 0,
  listenFront: 0,
  answerFrames: 0,
  answerFront: 0,
  onsetOffFrames: 0,
  // 자세 — 어깨가 잡힌 프레임에서만 쌓인다 (기울기·흔들림은 같은 표본)
  tiltSamples: [],
  shoulderXs: [],
  worldFrames: 0,
  headDown: 0,
  rollSum: 0,
  // 표정·시선 관찰 지표
  blinks: 0,
  blinkOn: false,
  smile: 0,
  duchenne: 0, // 미소 프레임 중 눈둘레근이 함께 움직인 프레임 (진정성 미소)
  mouthPress: 0,
  browDown: 0,
  browRaise: 0,
  irisFrames: 0,
  offDirs: { down: 0, up: 0, left: 0, right: 0 },
  // 교차 분석 타임라인 — 2초 빈당 정면율·긴장율(입술 압축∥찡그림)·기울기.
  // 서버 moments가 '결정적 순간'(시선 이탈+긴장 표정이 겹친 4초)을 잡는 유일한
  // 재료다. 빈 인덱스는 프레임 서수 기반(frames×SAMPLE_MS) — 얼굴을 놓친 시간은
  // 압축되지만, 키오스크 정면 체험에서는 벽시계와의 오차가 무시할 수준이다.
  bins: [], // 희소 배열: [{frames, front, press, tiltSum, tiltN}]
});

/** 한 샘플을 누적한다.
 *
 * @param sample.front      정면 응시 판정 (히스테리시스 적용 후)
 * @param sample.offDir     이탈 방향 (down|up|left|right|null)
 * @param sample.phase      'listening' | 'answering' | null
 * @param sample.tiltAdj    기준 보정 어깨 기울기(도) — 어깨 미검출이면 null
 * @param sample.shoulderX  어깨 중심 x / 어깨너비 (거리 정규화) — 미검출이면 null
 * @param sample.worldUsed  3D 월드 랜드마크로 기울기를 냈는가 (능력 플래그)
 */
export function accumulateSample(acc, sample) {
  const {
    front,
    offDir = null,
    phase = null,
    blink = false,
    smile = false,
    duchenne = false,
    press = false,
    brow = false,
    browRaise = false,
    iris = false,
    rollDeg = 0,
    tiltAdj = null,
    shoulderX = null,
    headDown = false,
    worldUsed = false,
  } = sample;

  acc.frames += 1;
  if (front) {
    acc.front += 1;
    acc.curOffStreak = 0;
    acc.curContactStreak += 1;
  } else {
    // 이탈 '횟수'는 전환 시점에만 센다 (프레임마다 세면 지속시간이 되어버린다)
    if (acc.lastFront) {
      acc.offCount += 1;
      if (offDir) acc.offDirs[offDir] += 1;
    }
    acc.curOffStreak += 1;
    if (acc.curOffStreak > acc.maxOffStreak) acc.maxOffStreak = acc.curOffStreak;
    if (acc.curContactStreak > 0) acc.contactBouts.push(acc.curContactStreak);
    acc.curContactStreak = 0;
  }
  acc.lastFront = front;

  if (phase === "listening") {
    acc.listenFrames += 1;
    if (front) acc.listenFront += 1;
  } else if (phase === "answering") {
    acc.answerFrames += 1;
    if (front) acc.answerFront += 1;
    // 개시 유예 구간의 회피만 별도 집계 — 서버가 감점에서 면제할 근거
    if (!front && acc.answerFrames <= framesFor(ONSET_GRACE_MS)) acc.onsetOffFrames += 1;
  }

  if (blink && !acc.blinkOn) acc.blinks += 1;
  acc.blinkOn = blink;
  if (smile) {
    acc.smile += 1;
    if (duchenne) acc.duchenne += 1;
  }
  if (press) acc.mouthPress += 1;
  if (brow) acc.browDown += 1;
  if (browRaise) acc.browRaise += 1;
  if (iris) acc.irisFrames += 1;
  acc.rollSum += rollDeg;

  if (tiltAdj !== null && shoulderX !== null) {
    acc.tiltSamples.push(tiltAdj);
    acc.shoulderXs.push(shoulderX);
    if (worldUsed) acc.worldFrames += 1;
    if (headDown) acc.headDown += 1;
  }

  // ---- 타임라인 빈 누적 (턴 시작 = 0초, 프레임 서수 기반) ----
  const binIdx = Math.floor(((acc.frames - 1) * SAMPLE_MS) / TIMELINE_BIN_MS);
  if (binIdx < TIMELINE_MAX_BINS) {
    const bin = acc.bins[binIdx]
      || (acc.bins[binIdx] = { frames: 0, front: 0, press: 0, tiltSum: 0, tiltN: 0 });
    bin.frames += 1;
    if (front) bin.front += 1;
    if (press || brow) bin.press += 1; // 긴장율 = 입술 압축 ∥ 찡그림 (poc 계약)
    if (tiltAdj !== null) {
      bin.tiltSum += tiltAdj;
      bin.tiltN += 1;
    }
  }
}

/** 턴 누적치를 서버 NonverbalIn 페이로드로 직렬화. 표본 1초 미만이면 보류(null). */
export function finalizeTurnMetrics(acc, calibrated = false) {
  if (acc.frames < framesFor(1000)) return null;

  // 자세 유지력: 후반부가 전반부보다 얼마나 무너졌는가 (+가 붕괴).
  // 서버는 음수(개선)를 감점하지 않는다.
  const driftMin = framesFor(DRIFT_MIN_MS);
  let tiltDrift = 0;
  if (acc.tiltSamples.length >= driftMin) {
    const h = Math.floor(acc.tiltSamples.length / 2);
    tiltDrift = mean(acc.tiltSamples.slice(h)) - mean(acc.tiltSamples.slice(0, h));
  }

  // 진행 중인 응시 구간도 바우트로 인정 — 턴 내내 눈을 맞춘 경우가 누락되면 안 된다
  const bouts = [...acc.contactBouts];
  if (acc.curContactStreak > 0) bouts.push(acc.curContactStreak);

  const [domDir, domCount] = Object.entries(acc.offDirs).reduce((a, b) => (b[1] > a[1] ? b : a));
  const minutes = (acc.frames * SAMPLE_MS) / 60000;
  const secs = (frames) => Math.round((frames * SAMPLE_MS) / 100) / 10;
  const ratio = (n) => Math.round((n / acc.frames) * 100) / 100;

  return {
    frames: acc.frames,
    front_gaze_ratio: acc.front / acc.frames,
    gaze_off_count: acc.offCount,
    avg_shoulder_tilt_deg: acc.tiltSamples.length ? mean(acc.tiltSamples) : 0,
    head_down_ratio: acc.headDown / acc.frames,
    // 상체 흔들림: 어깨 중심 x(어깨너비 정규화)의 표준편차 — 서버 SWAY_BANDS 입력.
    // 표본 2개 이하는 표준편차가 무의미하므로 0.
    posture_sway: acc.shoulderXs.length > 2 ? stdDev(acc.shoulderXs) : 0,
    tilt_drift_deg: Math.round(tiltDrift * 10) / 10,
    longest_off_sec: secs(acc.maxOffStreak),
    blink_per_min: minutes > 0.05 ? Math.round(acc.blinks / minutes) : 0,
    smile_ratio: ratio(acc.smile),
    // 진정성 미소: 미소 프레임 중 눈둘레근(AU6+AU7)이 함께 움직인 비율 —
    // 입만 웃는 사회적 미소와 눈까지 웃는 뒤셴 미소의 구분.
    // 미소 표본이 2초 미만이면 비율이 불안정하므로 판정 보류(null).
    smile_duchenne_ratio: acc.smile >= framesFor(DUCHENNE_MIN_MS)
      ? Math.round((acc.duchenne / acc.smile) * 100) / 100
      : null,
    head_roll_deg: Math.round((acc.rollSum / acc.frames) * 10) / 10,
    mouth_press_ratio: ratio(acc.mouthPress),
    brow_down_ratio: ratio(acc.browDown),
    // 눈썹 올림(AU1+AU2) 비율 — 무표정↔풍부한 표정. 경청·강조의 비언어 신호
    brow_raise_ratio: ratio(acc.browRaise),
    gaze_dirs: { ...acc.offDirs },
    gaze_off_dir: domCount >= 3 ? domDir : null,
    iris_ratio: ratio(acc.irisFrames),
    // 듣기/말하기 응시 분리 — 표본 2초 미만이면 판정 보류(null).
    // null이면 서버 score_eye가 v1(통합 응시) 경로로 하위 호환 동작한다.
    listening_front_ratio: acc.listenFrames >= framesFor(SPLIT_MIN_MS)
      ? Math.round((acc.listenFront / acc.listenFrames) * 100) / 100
      : null,
    answering_front_ratio: acc.answerFrames >= framesFor(SPLIT_MIN_MS)
      ? Math.round((acc.answerFront / acc.answerFrames) * 100) / 100
      : null,
    // 응시 리듬: 연속 응시 구간 평균 길이 — 서버 CONTACT_BOUT_BANDS(3~8초가 자연스러움)
    contact_bout_mean_sec: bouts.length ? secs(mean(bouts)) : 0,
    contact_streak_max_sec: secs(Math.max(0, ...bouts)),
    onset_aversion_sec: secs(acc.onsetOffFrames),
    // 3D 월드 기울기 가동률 — 리포트가 '거리 불변 측정'인지 밝힐 근거
    world_ratio: ratio(acc.worldFrames),
    // 교차 분석 타임라인: 2초 빈당 (t=초, front=정면율, press=긴장율, tilt=평균 기울기).
    // 이것이 없으면 서버 moments.build_moments가 항상 빈 배열을 돌려준다 —
    // '결정적 순간' 리포트 카드가 전시 경로에서 통째로 죽는다.
    timeline: acc.bins
      .map((b, i) => (b && b.frames ? {
        t: i * (TIMELINE_BIN_MS / 1000),
        front: Math.round((b.front / b.frames) * 100) / 100,
        press: Math.round((b.press / b.frames) * 100) / 100,
        tilt: b.tiltN ? Math.round((b.tiltSum / b.tiltN) * 10) / 10 : null,
      } : null))
      .filter(Boolean),
    // 시계축 정합: MVP는 poc와 달리 오디오 녹음도 턴 시작에 함께 출발한다
    // (PracticePage가 턴 렌더 시 MediaRecorder를 켠다). 비언어 타임라인과 음성
    // 스팬의 원점이 같으므로 오프셋은 0 — 서버 moments가 이 값으로 두 축을 겹친다.
    answer_offset_sec: 0,
    sample_ms: SAMPLE_MS,
    calibrated,
  };
}
