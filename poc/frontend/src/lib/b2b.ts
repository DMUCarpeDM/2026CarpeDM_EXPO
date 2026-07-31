/** B2B 온보딩 교육 화면 공용 라벨·표기 유틸 (S-B2B-112·S-B2B-118).
 *
 * 직무·등급·상태의 한국어 라벨을 한 곳에서만 정의한다 — 화면별 복제 금지.
 * 등급 경계 자체는 서버(score_policy)가 단독 소유하며, 프론트는 서버가 내려준
 * 등급 문자열을 색조로만 매핑한다 (점수 표기 방침: score-display-policy.md).
 */

/** 직무 코드 → 한국어 라벨 (도메인 결정: docs/plan/b2b/domain-decision.md) */
export const JOB_ROLE_LABELS: Record<string, string> = {
  cafe_crew: '카페 매장 크루',
  cs_agent: '고객센터 상담',
  office_admin: '사무행정 신입',
};

export function jobRoleLabel(role: string): string {
  return JOB_ROLE_LABELS[role] ?? (role || '미지정');
}

export const ORG_ROLE_LABELS: Record<string, string> = {
  trainee: '수강생',
  manager: '관리자',
};

export function orgRoleLabel(role: string): string {
  return ORG_ROLE_LABELS[role] ?? (role || '—');
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  basic: '기본',
  pressure: '압박',
};

export function difficultyLabel(difficulty: string): string {
  return DIFFICULTY_LABELS[difficulty] ?? difficulty;
}

/** 세션 FSM 상태 라벨 (SessionStatus와 정렬) */
export const STATUS_LABELS: Record<string, string> = {
  ready: '준비',
  in_progress: '진행 중',
  analyzing: '분석 중',
  completed: '완료',
  aborted: '중단',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** 등급 문자열 → 배지 색조 클래스 (등급 값은 서버가 내려준다) */
export function gradeTone(grade: string | null): 'good' | 'ok' | 'mid' | 'low' | 'none' {
  switch (grade) {
    case '우수':
      return 'good';
    case '양호':
      return 'ok';
    case '보통':
      return 'mid';
    case '연습 필요':
      return 'low';
    default:
      return 'none';
  }
}

/** 4-Fit 축 순서·짧은 라벨 — 수강생 화면의 미니 게이지용 */
export const FIT_ORDER = ['response', 'voice', 'eye', 'posture'] as const;

export const FIT_SHORT_LABELS: Record<(typeof FIT_ORDER)[number], string> = {
  response: '응답',
  voice: '발화',
  eye: '시선',
  posture: '자세',
};

/** ISO 일시 → "7월 31일 14:05" 형태 (연도는 올해와 다를 때만) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
  return d.getFullYear() === now.getFullYear() ? base : `${d.getFullYear()}년 ${base}`;
}
