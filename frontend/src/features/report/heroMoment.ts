/** 결정적 순간 히어로 — 리포트/부스 화면에서 '가장 강한 한 순간'을 고르는 순수 로직.
 *
 * 백엔드(moments.py)가 이미 (복합 > 압박 맥락 > 이른 순간)으로 정렬해 보낸다.
 * 여기서는 '히어로로 띄울 자격'만 판정한다 — 밋밋한 세션에 억지 드라마를
 * 만들지 않기 위해(과잉 지적 금지 원칙), 복합이거나 인용문이 있을 때만 승격한다.
 *
 * 순수 함수라 node --test로 회귀를 잡는다 (heroMoment.test.ts).
 */
import type { Report } from '../../api/types';

export type Moment = NonNullable<Report['deep_analysis']['moments']>[number];

/** 결정적 순간 종류 → 한국어 라벨 (backend moments.py KIND_LABEL와 일치). */
export const KIND_LABEL: Record<string, string> = {
  gaze: '시선 이탈',
  tension: '긴장 표정',
  posture: '자세 흔들림',
  quiet: '성량 저하',
  fast: '말 급해짐',
  hesitation: '긴 머뭇거림',
};

export const kindLabel = (kind: string): string => KIND_LABEL[kind] ?? kind;

/** 히어로로 띄울 만큼 강한 순간 하나. 없으면 null(히어로 미표시).
 * 자격: ① 복합(다중 모달 동시) ② 없으면 인용문이 있는 순간. 둘 다 없으면 null. */
export function selectHeroMoment(moments: Moment[] | undefined | null): Moment | null {
  if (!moments || moments.length === 0) return null;
  return moments.find((m) => m.composite) ?? moments.find((m) => !!m.quote) ?? null;
}

/** 같은 순간인지(턴·시각 동일) — 히어로를 하단 목록에서 중복 제거할 때 사용. */
export const sameMoment = (a: Moment, b: Moment): boolean =>
  a.turn_order === b.turn_order && a.at_sec === b.at_sec;
