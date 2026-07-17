// ⚠️ 기계 변환 사본 — 원본(단일 진실)은 poc/frontend/src/features/roleplay/nonverbalCore.ts 입니다.
// 로직 수정은 반드시 poc 원본에 먼저 반영한 뒤 이 사본을 재생성하세요 (타입만 제거된 동일 코드).
// 측정 샘플링 주기(ms). 기본 200ms(5Hz) — 깜빡임(100~300ms)·빠른 끄덕임은 샘플
// 사이로 빠져 과소 집계될 수 있는 물리 한계가 있다. 전시 PC 성능이 허락하면
// 운영자 패널에서 낮춰 실측한다: localStorage 'mirroting-sample-ms' = 100~500 (§2.5).
// 아래 모든 표본 게이트는 framesFor(시간 기준)라 값만 바꾸면 일관되게 동작한다.
export const SAMPLE_MS = (() => {
    if (typeof localStorage === 'undefined')
        return 200; // 테스트(node) 환경
    const v = Number(localStorage.getItem('mirroting-sample-ms'));
    return Number.isFinite(v) && v >= 100 && v <= 500 ? v : 200;
})();
/** 시간 길이(ms) → 표본 게이트 프레임 수 — 샘플링 주기와 무관하게 같은 시간 기준 */
export const framesFor = (ms) => Math.max(1, Math.round(ms / SAMPLE_MS));
// 기준 대비 허용 편차 (캘리브레이션 후 상대 판정)
export const YAW_DELTA_THRESHOLD = 0.22; // 시선 좌우: 비대칭 변화량
export const HEAD_DROP_THRESHOLD = 0.1; // 고개 숙임: 코-어깨 거리(어깨너비 정규화) 감소량
// 캘리브레이션이 없을 때(직접 URL 진입 등) 쓰는 절대 폴백 임계값
export const YAW_ABS_THRESHOLD = 0.3;
export const HEAD_DOWN_ABS_THRESHOLD = 0.3;
// 눈-머리 편향을 머리 비대칭 스케일로 환산하는 계수 (홍채 가동폭 ~±0.35)
export const EYE_COMP_GAIN = 0.8;
export const EYE_COMP_CLAMP = 0.18; // 보상 상한 — 보상이 판정을 뒤집는 폭주 방지
export const EYE_ONLY_THRESHOLD = 0.25; // 머리는 정면인데 눈만 옆을 보는 이탈 감지
export const EYE_Y_DELTA = 0.25; // 기준 대비 상/하 편향 임계 (보수 — 실기기 보정 항목)
export const EYE_Y_RESCUE = 0.05; // 홍채가 이 안(중앙)이면 blendshape가 높아도 정면 유지
// 끄덕임 근사(경청 자세): 듣기 중 headGap 방향 반전을 세되, 한 방향 이동 진폭이
// 어깨너비의 4% 이상일 때만 — 추적 지터를 끄덕임으로 오인하지 않는 보수 게이트
export const NOD_MIN_SWING = 0.04;
export const NOD_JITTER_EPS = 0.005; // 이보다 작은 표본 간 변화는 무시
// 교차 분석 타임라인 빈
export const TIMELINE_BIN_MS = 2000;
export const TIMELINE_MAX_BINS = 120; // 4분 상한 — 페이로드 폭주 방지
// ---- 표현 동작 확장 ⑤ (전부 감점 없는 관찰 지표) ----
// 눈썹 표현력(표정 생동감): browInnerUp/OuterUp 블렌드셰이프 평균이 이 이상이면 '올림'.
// 무표정↔풍부한 표정을 가르는 보수 임계값 — 실기기 보정 항목(demo-checklist §2.5).
export const BROW_RAISE_MIN = 0.4;
// 손 활동 임계 — 손목 월드 변위가 이 이상이면 그 손이 '움직이는 중'. 양손 제스처
// 판정에서 gestureActive와 같은 경계를 공유한다(m/샘플, ~0.1 m/s @200ms).
export const HAND_ACTIVE_MIN = 0.02;
// ---------------------------------------------------------------------------
// 통계 헬퍼
// ---------------------------------------------------------------------------
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
export const emptyAcc = () => ({
    frames: 0,
    frontFrames: 0,
    gazeOffCount: 0,
    lastFront: true,
    tiltSamples: [],
    headDownFrames: 0,
    shoulderXs: [],
    frontFlags: [],
    offDirs: { down: 0, up: 0, left: 0, right: 0 },
    curOffStreak: 0,
    maxOffStreak: 0,
    blinkCount: 0,
    blinkActive: false,
    smileFrames: 0,
    duchenneFrames: 0,
    tensionStreaks: [],
    curTensionStreak: 0,
    rollSamples: [],
    mouthPressFrames: 0,
    browDownFrames: 0,
    handFaceFrames: 0,
    armCrossFrames: 0,
    asymSamples: [],
    offStreaks: [],
    shoulderWidths: [],
    irisFrames: 0,
    irisVFrames: 0,
    contactBouts: [],
    curContactStreak: 0,
    listenFrames: 0,
    listenFront: 0,
    answerFrames: 0,
    answerFront: 0,
    answerStartedAt: 0,
    onsetOffFrames: 0,
    gazeZones: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    worldFrames: 0,
    gestureDistSum: 0,
    gestureSamples: 0,
    gestureActive: 0,
    handSeenFrames: 0,
    hipXs: [],
    lowerVisFrames: 0,
    guardFrames: 0,
    nodReversals: 0,
    nodPrevGap: null,
    nodDir: 0,
    nodSwing: 0,
    listenWidths: [],
    browRaiseFrames: 0,
    gestureReachSum: 0,
    gestureReachSamples: 0,
    twoHandFrames: 0,
    handActiveFrames: 0,
    headPosSamples: [],
    turnStartedAt: 0,
    bins: [],
    tips: [],
});
export const emptyBaseline = () => ({
    set: false, asym: 0, tilt: 0, headGap: null, roll: 0, eyeX: null, eyeY: null,
    blinkPerMin: null, width: null,
});
export const emptyCalibration = () => ({
    asym: [], tilt: [], headGap: [], roll: [], eyeX: [], eyeY: [], width: [],
    blinks: 0, blinkFrames: 0, blinkOn: false,
});
/** 브리핑 종료 시 중앙값으로 기준 확정 — 표본 4개 미만이면 절대 판정 유지(set=false) */
export function finalizeCalibration(cal) {
    if (cal.asym.length < 4)
        return emptyBaseline();
    return {
        set: true,
        asym: median(cal.asym),
        tilt: cal.tilt.length >= 4 ? median(cal.tilt) : 0,
        headGap: cal.headGap.length >= 4 ? median(cal.headGap) : null,
        roll: cal.roll.length >= 4 ? median(cal.roll) : 0,
        // 홍채 기준은 표본 분산까지 확인 — 흔들리는 표본으로 보상하면 오판을 만든다
        eyeX: cal.eyeX.length >= 4 && stdDev(cal.eyeX) < 0.08 ? median(cal.eyeX) : null,
        eyeY: cal.eyeY.length >= 4 && stdDev(cal.eyeY) < 0.08 ? median(cal.eyeY) : null,
        // 깜빡임 기저선은 표본 10초 이상일 때만 — 짧은 창의 비율 추정은 오차가 크다
        blinkPerMin: cal.blinkFrames >= framesFor(10000)
            ? Math.round(cal.blinks / ((cal.blinkFrames * SAMPLE_MS) / 60000))
            : null,
        // 평상시 어깨폭 — 듣기 리닝(전진/후퇴)의 기준. 미러 앞 위치가 고정된 전시
        // 환경 전제이며, 걸어서 이동하면 리닝으로 오인될 수 있다(실기기 검증 항목)
        width: cal.width.length >= 4 ? median(cal.width) : null,
    };
}
/** 시선 판정 = 머리 자세 + 홍채 보상. 고개를 돌려도 눈이 카메라를 보면 정면이다.
 *
 * 홍채 보상은 "구제 전용" 보수 설계: 보상은 이탈 판정을 완화하는 방향으로만
 * 적용한다. 부호 추정이 틀려도 머리-단독 판정(v1)보다 나빠질 수 없다.
 */
export function resolveGaze(input, base) {
    const { signedAsym, eyeInHeadX, eyeInHeadY, eyeDown, eyeUp } = input;
    let front = true;
    let offDir = null;
    let gazeX = null;
    let eyeYDelta = null;
    let irisUsed = false;
    let irisVUsed = false;
    if (signedAsym !== null) {
        const asymDelta = base.set ? signedAsym - base.asym : signedAsym;
        const yawThreshold = base.set ? YAW_DELTA_THRESHOLD : YAW_ABS_THRESHOLD;
        gazeX = asymDelta;
        if (eyeInHeadX !== null && base.eyeX !== null) {
            const eyeDelta = eyeInHeadX - base.eyeX;
            const comp = Math.max(-EYE_COMP_CLAMP, Math.min(EYE_COMP_CLAMP, eyeDelta * EYE_COMP_GAIN));
            const compensated = asymDelta - comp;
            if (Math.abs(compensated) < Math.abs(asymDelta)) {
                gazeX = compensated;
                irisUsed = true;
            }
            // 머리는 정면인데 눈만 옆을 보는 이탈 (머리-단독 판정이 놓치던 축)
            if (Math.abs(asymDelta) < yawThreshold
                && Math.abs(eyeDelta) >= EYE_ONLY_THRESHOLD) {
                offDir = eyeDelta > 0 ? 'left' : 'right';
                irisUsed = true;
            }
        }
        // 수직 홍채(기준 보정)가 있으면 상하 판정의 주 신호로 승격:
        // ① 미세한 아래 훔쳐보기를 blendshape보다 정밀하게 잡고
        // ② 홍채가 중앙(±EYE_Y_RESCUE)인데 blendshape만 높은 실눈
        //    오작동은 정면으로 구제한다. 없으면 기존 blendshape 폴백.
        if (eyeInHeadY !== null && base.eyeY !== null) {
            eyeYDelta = eyeInHeadY - base.eyeY;
        }
        if (offDir === null) {
            if (Math.abs(gazeX) >= yawThreshold) {
                offDir = gazeX > 0 ? 'right' : 'left';
            }
            else if (eyeYDelta !== null) {
                if (eyeYDelta >= EYE_Y_DELTA
                    || (eyeDown > 0.55 && eyeYDelta > EYE_Y_RESCUE)) {
                    offDir = 'down';
                    irisVUsed = true;
                }
                else if (-eyeYDelta >= EYE_Y_DELTA
                    || (eyeUp > 0.55 && eyeYDelta < -EYE_Y_RESCUE)) {
                    offDir = 'up';
                    irisVUsed = true;
                }
            }
            else if (eyeDown > 0.55) {
                offDir = 'down'; // 머리는 정면, 눈동자만 아래 (대본 읽기 패턴)
            }
            else if (eyeUp > 0.55) {
                offDir = 'up';
            }
        }
        front = offDir === null;
    }
    return { front, offDir, gazeX, eyeYDelta, irisUsed, irisVUsed };
}
/** 고개 숙임 — 기준이 있으면 코-어깨 거리 감소량, 없으면 절대 폴백 */
export function resolveHeadDown(headGap, base) {
    return headGap !== null && (base.set && base.headGap !== null
        ? base.headGap - headGap > HEAD_DROP_THRESHOLD
        : headGap < HEAD_DOWN_ABS_THRESHOLD);
}
/** 끄덕임 근사 — headGap(코-어깨 거리) 상하 방향 반전 계수. 몸 전체가 출렁이면
 * 코·어깨가 함께 움직여 headGap이 안 변하므로 상쇄되고, 고개만 끄덕일 때만
 * 반전이 잡힌다. 진폭 게이트(NOD_MIN_SWING)로 추적 지터를 배제한다. */
export function updateNod(acc, headGap) {
    if (acc.nodPrevGap !== null) {
        const delta = headGap - acc.nodPrevGap;
        if (Math.abs(delta) > NOD_JITTER_EPS) {
            const dir = delta > 0 ? 1 : -1;
            if (dir !== acc.nodDir) {
                if (acc.nodDir !== 0 && acc.nodSwing >= NOD_MIN_SWING) {
                    acc.nodReversals += 1;
                }
                acc.nodDir = dir;
                acc.nodSwing = 0;
            }
            acc.nodSwing += Math.abs(delta);
        }
    }
    acc.nodPrevGap = headGap;
}
// ---------------------------------------------------------------------------
// 다인 가드·수직 홍채 — 프레임 기하 판정 (자세·얼굴 가드 공용)
// ---------------------------------------------------------------------------
/** 다인 가드: 중심 좌표나 크기가 한 샘플 만에 급변하면 추적 대상이 바뀐 것
 * (관람객 난입·끼어듦)일 수 있다 → 해당 프레임의 집계를 폐기할 근거. */
export function trackerJumped(prev, x, w, maxDx, maxRatio) {
    if (!prev)
        return false;
    return Math.abs(x - prev.x) > maxDx || w > prev.w * maxRatio || w < prev.w / maxRatio;
}
/** 수직 홍채: 눈꺼풀 사이 상하 위치 (0=위 눈꺼풀, 1=아래). 깜빡임·실눈 중에는
 * 분모(눈 열림)가 무너져 오판 제조기가 되므로, 열림/눈 너비 비가 openMin 미만이면
 * 표본을 버린다(null). */
export function verticalIrisRatio(iris, upper, lower, inner, outer, openMin) {
    const open = lower.y - upper.y;
    const w = Math.abs(outer.x - inner.x) || 1e-6;
    if (open / w < openMin)
        return null;
    return (iris.y - upper.y) / (open || 1e-6);
}
/** 3×3 시선 존 인덱스 (행: 위/중/아래 × 열: 좌/중/우).
 * 상하 행은 수직 홍채(기준 보정)가 있으면 홍채 기반으로 정밀화한다. */
export function gazeZoneIndex(gazeX, eyeYDelta, eyeUp, eyeDown, headDown) {
    const col = gazeX === null ? 1 : gazeX < -0.15 ? 0 : gazeX > 0.15 ? 2 : 1;
    const row = eyeYDelta !== null
        ? (eyeYDelta <= -0.18 ? 0 : eyeYDelta >= 0.18 || headDown ? 2 : 1)
        : (eyeUp > 0.45 ? 0 : eyeDown > 0.45 || headDown ? 2 : 1);
    return row * 3 + col;
}
// ---------------------------------------------------------------------------
// 턴 종료 직렬화 — 서버 페이로드
// ---------------------------------------------------------------------------
/** 턴 누적치를 서버 페이로드로 직렬화. 표본 1초 미만이면 측정 보류(null). */
export function finalizeTurnMetrics(acc, base) {
    if (acc.frames < framesFor(1000))
        return null;
    const xs = acc.shoulderXs;
    let sway = 0;
    if (xs.length > 2) {
        const m = mean(xs);
        sway = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    }
    // 전/후반 추세: 후반부 자세 붕괴·시선 저하 감지 (전·후반 각 1초 이상 표본)
    const driftMin = framesFor(2000);
    let tiltDrift = 0;
    if (acc.tiltSamples.length >= driftMin) {
        const h = Math.floor(acc.tiltSamples.length / 2);
        tiltDrift = mean(acc.tiltSamples.slice(h)) - mean(acc.tiltSamples.slice(0, h));
    }
    let frontDrift = 0;
    if (acc.frontFlags.length >= driftMin) {
        const h = Math.floor(acc.frontFlags.length / 2);
        const ratio = (flags) => flags.filter(Boolean).length / flags.length;
        frontDrift = Math.round((ratio(acc.frontFlags.slice(h)) - ratio(acc.frontFlags.slice(0, h))) * 100);
    }
    // 이탈 방향 분포에서 지배 방향 (표본 3프레임 이상일 때만)
    const dirEntries = Object.entries(acc.offDirs);
    const [domDir, domCount] = dirEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const minutes = (acc.frames * SAMPLE_MS) / 60000;
    return {
        front_gaze_ratio: acc.frontFrames / acc.frames,
        gaze_off_count: acc.gazeOffCount,
        avg_shoulder_tilt_deg: acc.tiltSamples.length ? mean(acc.tiltSamples) : 0,
        head_down_ratio: acc.headDownFrames / acc.frames,
        posture_sway: sway,
        frames: acc.frames,
        longest_off_sec: Math.round((acc.maxOffStreak * SAMPLE_MS) / 100) / 10,
        blink_per_min: minutes > 0.05 ? Math.round(acc.blinkCount / minutes) : 0,
        // 깜빡임 동역학: 안정 상태(브리핑) 기저선 — 서버가 '기저선 대비 급증'으로 판정
        blink_base_per_min: base.blinkPerMin,
        gaze_off_dir: domCount >= 3 ? domDir : null,
        tilt_drift_deg: Math.round(tiltDrift * 10) / 10,
        front_drift_pct: frontDrift,
        smile_ratio: Math.round((acc.smileFrames / acc.frames) * 100) / 100,
        // 진정성 미소 근사: 미소 프레임 중 눈둘레근 동시 활성 비율 —
        // 입만 웃는 서비스 미소와 눈까지 웃는 미소의 구분. 미소 표본 2초 미만은 판정 보류(null)
        smile_duchenne_ratio: acc.smileFrames >= framesFor(2000)
            ? Math.round((acc.duchenneFrames / acc.smileFrames) * 100) / 100
            : null,
        // 표정 복구 시간: 긴장 표정(입술 압축·찡그림) 에피소드가 풀리기까지 평균 초 —
        // 압박 턴 vs 평상 턴 비교(교차 분석 composure)의 재료. 에피소드 없으면 0
        expr_recover_sec: (() => {
            const eps = [...acc.tensionStreaks];
            if (acc.curTensionStreak >= framesFor(400))
                eps.push(acc.curTensionStreak);
            return eps.length ? Math.round((mean(eps) * SAMPLE_MS) / 100) / 10 : 0;
        })(),
        head_roll_deg: acc.rollSamples.length
            ? Math.round(mean(acc.rollSamples.map(Math.abs)) * 10) / 10
            : 0,
        mouth_press_ratio: Math.round((acc.mouthPressFrames / acc.frames) * 100) / 100,
        brow_down_ratio: Math.round((acc.browDownFrames / acc.frames) * 100) / 100,
        hand_face_sec: Math.round((acc.handFaceFrames * SAMPLE_MS) / 100) / 10,
        arm_cross_ratio: Math.round((acc.armCrossFrames / acc.frames) * 100) / 100,
        gaze_dirs: { ...acc.offDirs },
        // ---- Eye-Fit 심화 ----
        // 홍채 추적 가동률 — 리포트가 "머리 추적"인지 "시선 추적"인지 밝힐 근거
        iris_ratio: Math.round((acc.irisFrames / acc.frames) * 100) / 100,
        // 수직 홍채가 상하 판정에 실제로 쓰인 프레임 비율 (능력 플래그)
        iris_v_ratio: Math.round((acc.irisVFrames / acc.frames) * 100) / 100,
        // 듣기/말하기 응시 분리 (표본 2초 미만이면 판정 보류 = null)
        listening_front_ratio: acc.listenFrames >= framesFor(2000)
            ? Math.round((acc.listenFront / acc.listenFrames) * 100) / 100
            : null,
        answering_front_ratio: acc.answerFrames >= framesFor(2000)
            ? Math.round((acc.answerFront / acc.answerFrames) * 100) / 100
            : null,
        // 응시 리듬: 연속 응시 구간(바우트)의 평균 길이 — 3~7초가 자연스러운 대화 리듬
        contact_bout_mean_sec: (() => {
            const bouts = [...acc.contactBouts];
            if (acc.curContactStreak > 0)
                bouts.push(acc.curContactStreak);
            return bouts.length
                ? Math.round((mean(bouts) * SAMPLE_MS) / 100) / 10
                : 0;
        })(),
        // 최장 연속 응시(아이컨택 스트릭) — 눈맞춤이 실제로 '성립'한 증거. 긍정 지표
        contact_streak_max_sec: (() => {
            const longest = Math.max(0, ...acc.contactBouts, acc.curContactStreak);
            return Math.round((longest * SAMPLE_MS) / 100) / 10;
        })(),
        // 답변 개시 직후(2.5초 유예)의 시선 회피 — 생각 정리 행동, 감점에서 제외할 근거
        onset_aversion_sec: Math.round((acc.onsetOffFrames * SAMPLE_MS) / 100) / 10,
        // 3×3 시선 존 분포 (위/중/아래 × 좌/중/우) — 시선 지도
        gaze_zones: [...acc.gazeZones],
        // 교차 분석 타임라인: 2초 빈당 (t=초, front=정면율, press=긴장율, tilt=평균 기울기)
        timeline: acc.bins
            .map((b, i) => ({
            t: i * (TIMELINE_BIN_MS / 1000),
            front: b.frames ? Math.round((b.front / b.frames) * 100) / 100 : null,
            press: b.frames ? Math.round((b.press / b.frames) * 100) / 100 : null,
            tilt: b.frames ? Math.round((b.tiltSum / b.frames) * 10) / 10 : null,
        }))
            .filter((b) => b.front !== null),
        // 시선 미세 안정성: 정면 판정 내에서의 흔들림 (표준편차) — 스캐닝 습관 감지
        gaze_stability: acc.asymSamples.length > framesFor(1000)
            ? Math.round(stdDev(acc.asymSamples) * 1000) / 1000
            : 0,
        // 이탈 후 정면 복귀까지 평균 시간 — 회복 탄력
        gaze_recover_sec: acc.offStreaks.length
            ? Math.round((mean(acc.offStreaks) * SAMPLE_MS) / 100) / 10
            : 0,
        // 앞/뒤 리닝 추세: 후반 어깨폭 / 전반 대비 (%) — +는 카메라 쪽으로 다가옴
        lean_drift_pct: (() => {
            const w = acc.shoulderWidths;
            if (w.length < driftMin)
                return 0;
            const h = Math.floor(w.length / 2);
            return Math.round((mean(w.slice(h)) / mean(w.slice(0, h)) - 1) * 100);
        })(),
        // ---- Posture 마스터 (③): 3D 월드·제스처·전신 — 관찰 지표 (감점 없음) ----
        // 3D 월드 기울기 가동률 — 리포트가 '거리 불변 측정'인지 밝힐 근거 (iris_ratio와 동형)
        world_ratio: Math.round((acc.worldFrames / acc.frames) * 100) / 100,
        // 제스처 에너지: 손목 평균 속도(m/s, 골반 원점 월드 좌표). 표본 5초 미만 보류
        gesture_energy: acc.gestureSamples >= framesFor(5000)
            ? Math.round((acc.gestureDistSum / (acc.gestureSamples * (SAMPLE_MS / 1000))) * 1000) / 1000
            : null,
        // 제스처 활동 비율: 실제로 움직인(>0.1m/s) 표본 비율 — 경직(얼어 있음) 감지 근거
        gesture_active_ratio: acc.gestureSamples >= framesFor(5000)
            ? Math.round((acc.gestureActive / acc.gestureSamples) * 100) / 100
            : null,
        hands_visible_ratio: Math.round((acc.handSeenFrames / acc.frames) * 100) / 100,
        // 골반 중심 좌우 흔들림(어깨너비 정규화 표준편차) — 서서 체중을 옮기는 습관
        hip_sway: acc.hipXs.length >= framesFor(5000)
            ? Math.round(stdDev(acc.hipXs) * 1000) / 1000
            : null,
        lower_visible_ratio: Math.round((acc.lowerVisFrames / acc.frames) * 100) / 100,
        // 다인 가드가 자세 집계에서 제외한 프레임 수 (측정 투명성)
        guard_dropped_frames: acc.guardFrames,
        // ---- 경청 자세 (듣기 페이즈 — 관찰 지표) ----
        // 끄덕임 근사: 진폭 게이트를 통과한 상하 반전 쌍의 수 (내림+올림 = 1회)
        nod_count: Math.floor(acc.nodReversals / 2),
        listen_sec: Math.round((acc.listenFrames * SAMPLE_MS) / 100) / 10,
        // 듣기 리닝: 기준 어깨폭 대비 듣는 동안 전진(+)/후퇴(-) % — 표본 2초·기준 필요
        listen_lean_pct: (() => {
            if (base.width === null || acc.listenWidths.length < framesFor(2000))
                return null;
            return Math.round((mean(acc.listenWidths) / base.width - 1) * 100);
        })(),
        // ---- 표현 동작 확장 ⑤: 표정 생동감·제스처 크기/양손·머리 흔들림 (관찰 지표) ----
        // 눈썹 표현력: 눈썹 올림 프레임 비율 — 무표정↔풍부한 표정. 강조·경청의 비언어 신호
        brow_raise_ratio: Math.round((acc.browRaiseFrames / acc.frames) * 100) / 100,
        // 제스처 크기: 손목이 어깨중심에서 뻗은 평균 거리(cm, 월드) — 속도(gesture_energy)와
        // 구분되는 '개방성/시원함'. 월드 손목 표본 5초 미만이면 보류(null)
        gesture_amplitude: acc.gestureReachSamples >= framesFor(5000)
            ? Math.round((acc.gestureReachSum / acc.gestureReachSamples) * 100 * 10) / 10
            : null,
        // 양손 제스처 비율: 양 손목이 동시에 움직인 프레임 / 한 손이라도 움직인 프레임 —
        // 양손 사용은 강조·확신의 신호. 손 활동 3초 미만이면 보류(null)
        gesture_two_handed_ratio: acc.handActiveFrames >= framesFor(3000)
            ? Math.round((acc.twoHandFrames / acc.handActiveFrames) * 100) / 100
            : null,
        // 머리 흔들림: 말하는 동안 코 위치(어깨너비 정규화)의 표준편차 — roll(각도)·
        // sway(어깨)와 다른 축의 '안절부절/떨림'. 답변 표본 3초 미만이면 보류(null)
        head_motion: acc.headPosSamples.length >= framesFor(3000)
            ? Math.round(Math.hypot(stdDev(acc.headPosSamples.map((p) => p.x)), stdDev(acc.headPosSamples.map((p) => p.y))) * 1000) / 1000
            : null,
        // 측정 샘플링 주기 — 서버가 프레임 수를 시간으로 해석할 때의 기준 (운영 튜닝 가능)
        sample_ms: SAMPLE_MS,
        // 시계축 정합: 턴 시작(질문 TTS)→답변 녹음 시작까지 초. moments가 비언어
        // 타임라인(턴 시계)과 음성 스팬(답변 시계)을 같은 축으로 합성할 근거
        answer_offset_sec: acc.answerStartedAt && acc.turnStartedAt
            ? Math.round((acc.answerStartedAt - acc.turnStartedAt) / 100) / 10
            : null,
        calibrated: base.set,
        tips: acc.tips,
    };
}
