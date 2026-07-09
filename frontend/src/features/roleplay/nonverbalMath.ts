/** 비언어 측정의 순수 계산 코어 — useNonverbal 훅에서 추출.
 *
 * 훅 본체(카메라·MediaPipe·타이머)는 브라우저 없이 테스트할 수 없지만,
 * 판정 로직의 경계 조건(끄덕임 반전, 다인 가드, 눈 열림 게이트)은 여기서
 * vitest로 고정한다 — 백엔드 골든 하네스의 프론트 대응물.
 */

export interface Point {
  x: number;
  y: number;
}

/** 시간 길이(ms) → 표본 게이트 프레임 수 — 샘플링 주기와 무관하게 같은 시간 기준 */
export function framesFor(ms: number, sampleMs: number): number {
  return Math.max(1, Math.round(ms / sampleMs));
}

export function stdDev(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---- 끄덕임 근사 (경청 자세) ----
// headGap(코-어깨 거리)의 상하 방향 반전을 계수. 한 방향 누적 진폭이 minSwing
// 이상일 때의 반전만 인정 — 추적 지터를 끄덕임으로 오인하지 않는 보수 게이트.
// 내림+올림(반전 2회) = 끄덕임 1회.

export interface NodState {
  nodPrevGap: number | null;
  nodDir: number; // +1 아래 / -1 위 / 0 초기
  nodSwing: number;
  nodReversals: number;
}

export function updateNod(
  state: NodState, headGap: number, minSwing: number, jitterEps: number,
): void {
  if (state.nodPrevGap !== null) {
    const delta = headGap - state.nodPrevGap;
    if (Math.abs(delta) > jitterEps) {
      const dir = delta > 0 ? 1 : -1;
      if (dir !== state.nodDir) {
        if (state.nodDir !== 0 && state.nodSwing >= minSwing) {
          state.nodReversals += 1;
        }
        state.nodDir = dir;
        state.nodSwing = 0;
      }
      state.nodSwing += Math.abs(delta);
    }
  }
  state.nodPrevGap = headGap;
}

// ---- 다인 가드 (자세·얼굴 공용) ----
// 중심 좌표나 크기가 한 샘플(200ms) 만에 급변하면 추적 대상이 바뀐 것
// (관람객 난입·끼어듦)일 수 있다 → 해당 프레임의 집계를 폐기할 근거.

export function trackerJumped(
  prev: { x: number; w: number } | null,
  x: number, w: number,
  maxDx: number, maxRatio: number,
): boolean {
  if (!prev) return false;
  return Math.abs(x - prev.x) > maxDx || w > prev.w * maxRatio || w < prev.w / maxRatio;
}

// ---- 수직 홍채 (눈꺼풀 사이 상하 위치) ----
// 0 = 위 눈꺼풀, 1 = 아래 눈꺼풀. 깜빡임·실눈 중에는 분모(눈 열림)가 무너져
// 오판 제조기가 되므로, 열림/눈 너비 비가 openMin 미만이면 표본을 버린다(null).

export function verticalIrisRatio(
  iris: Point, upper: Point, lower: Point, inner: Point, outer: Point,
  openMin: number,
): number | null {
  const open = lower.y - upper.y;
  const w = Math.abs(outer.x - inner.x) || 1e-6;
  if (open / w < openMin) return null;
  return (iris.y - upper.y) / (open || 1e-6);
}
