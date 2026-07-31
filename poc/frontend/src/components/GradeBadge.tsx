/** 등급 배지·4-Fit 미니 게이지 (S-B2B-112) — 점수 표기 방침 공용 소자.
 * 수강생 화면은 등급 배지가 주 표기이고, fit 축은 숫자 없는 게이지로만 보여준다
 * (검증 전 원점수 과신 방지 — docs/plan/b2b/score-display-policy.md). */
import type { SessionFitScores } from '../api/types';
import { FIT_ORDER, FIT_SHORT_LABELS, gradeTone } from '../lib/b2b';

export function GradeBadge({ grade, large }: { grade: string | null; large?: boolean }) {
  return (
    <span className={`grade-badge ${gradeTone(grade)}${large ? ' lg' : ''}`}>
      {grade ?? '분석 전'}
    </span>
  );
}

/** 4축 미니 게이지 — 축 이름 + 채움 막대만 (숫자 미표기) */
export function FitMiniBars({ fits }: { fits: SessionFitScores }) {
  return (
    <div className="fit-mini">
      {FIT_ORDER.map((f) => {
        const score = fits?.[f]?.score ?? null;
        return (
          <div key={f} className="fit-mini-item">
            <span className="fit-mini-label">{FIT_SHORT_LABELS[f]}</span>
            <span className="fit-mini-track">
              {score !== null && (
                <span
                  className="fit-mini-fill"
                  style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
