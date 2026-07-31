/** 전체 대화 복기용 기기 로컬 답변 사본 (미저장 동의 호환).
 *
 * 미저장 동의(storage_policy 'none') 세션은 분석 직후 서버가 답변 원문을
 * 파기한다(poc/backend app/services/analysis.py). 리포트의 '전체 대화'는
 * 연습한 브라우저에 남긴 이 사본으로 답변 칸을 채운다 — 서버에는 어떤
 * 원문도 추가로 남기지 않는다. 키는 mirror-ting-session-* 접두사를 따라
 * 키오스크 관람객 격리(resetVisitorIdentity)가 함께 지운다.
 */

function storageKey(sessionId: number): string {
  return `mirror-ting-session-${sessionId}-transcript`;
}

/** 직렬화된 사본을 turn order → 답변 텍스트 맵으로 복원 (손상 데이터는 빈 맵) */
export function parseLocalAnswers(raw: string | null): Record<number, string> {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    const answers = (data as { answers?: unknown }).answers;
    if (typeof answers !== 'object' || answers === null) return {};
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      const order = Number(k);
      if (Number.isInteger(order) && order > 0 && typeof v === 'string' && v.trim()) {
        out[order] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function loadLocalAnswers(sessionId: number): Record<number, string> {
  try {
    return parseLocalAnswers(localStorage.getItem(storageKey(sessionId)));
  } catch {
    return {};
  }
}

/** 턴 답변 확정 시 호출 — 실패(쿼터·프라이빗 모드)해도 역할극 진행은 막지 않는다 */
export function saveLocalAnswer(sessionId: number, order: number, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    const answers = loadLocalAnswers(sessionId);
    answers[order] = trimmed;
    localStorage.setItem(storageKey(sessionId), JSON.stringify({ v: 1, answers }));
  } catch {
    /* 복기 사본만 조용히 포기 */
  }
}
