/** 수강생 내 결과 (D-16, S-B2B-112) — 등급 배지 중심, 원점수는 보조 소자.
 * 데이터 소스: GET /api/sessions/mine. 점수 표기 방침(score-display-policy.md)에 따라
 * 수강생 화면은 4단계 등급이 주 표기이고, 원점수는 작은 참고 표기로만 붙인다. */
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authToken, getMySessions, updateJobRole } from '../../api/client';
import type { MySession } from '../../api/types';
import { FitMiniBars, GradeBadge } from '../../components/GradeBadge';
import { JOB_ROLE_LABELS, difficultyLabel, formatDateTime, jobRoleLabel, statusLabel } from '../../lib/b2b';
import { useAuthStore } from '../../stores/authStore';

export default function MyResultsPage() {
  const me = useAuthStore((s) => s.me);
  const [sessions, setSessions] = useState<MySession[] | null>(null);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(!authToken());
  const [jobSaving, setJobSaving] = useState(false);
  const [jobMessage, setJobMessage] = useState('');
  const [jobMessageOk, setJobMessageOk] = useState(true);

  useEffect(() => {
    if (!authToken()) return;
    getMySessions()
      .then(setSessions)
      .catch((e: unknown) => {
        if (isAxiosError(e) && e.response?.status === 401) setNeedLogin(true);
        else setError('연습 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      });
  }, []);

  // 직무 변경 (S-B2B-PACK) — 성공 시 authStore의 me를 서버 응답으로 교체해
  // 연습 시작 화면의 "내 직무" 기본 탭이 즉시 따라온다
  async function changeJobRole(value: string) {
    if (!value || value === me?.job_role || jobSaving) return;
    setJobSaving(true);
    setJobMessage('');
    try {
      useAuthStore.getState().setMe(await updateJobRole(value));
      setJobMessageOk(true);
      setJobMessage('직무가 변경됐습니다. 다음 연습부터 새 직무 시나리오가 먼저 보여요.');
    } catch (e: unknown) {
      setJobMessageOk(false);
      if (isAxiosError(e) && e.response?.status === 401) {
        setJobMessage('로그인이 만료됐습니다. 다시 로그인한 뒤 직무를 변경해 주세요.');
      } else if (isAxiosError(e) && e.response?.status === 422) {
        setJobMessage('알 수 없는 직무예요. 목록에서 다시 선택해 주세요.');
      } else {
        setJobMessage('직무 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setJobSaving(false);
    }
  }

  if (needLogin) {
    return (
      <div className="page auth">
        <div className="card auth-card">
          <h1>내 결과</h1>
          <p className="section-sub">연습 이력을 보려면 로그인이 필요합니다.</p>
          <Link className="primary-btn" to="/login?next=%2Fme%2Fresults">
            로그인하러 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page my-results">
      <header className="b2b-page-header">
        <h1>내 결과</h1>
        <p className="section-sub">
          연습 회차별 결과입니다. 등급은 우수 · 양호 · 보통 · 연습 필요 4단계로 표기돼요.
        </p>
        {/* 현재 직무 표시 + 변경 (S-B2B-PACK) — 직무는 시나리오 추천 축일 뿐 권한이 아니다 */}
        {me && (
          <div className="job-role-row">
            <span className="job-role-current">
              내 직무 <strong>{jobRoleLabel(me.job_role)}</strong>
            </span>
            <label>
              직무 변경{' '}
              <select
                value={me.job_role}
                disabled={jobSaving}
                onChange={(e) => changeJobRole(e.target.value)}
              >
                <option value="" disabled>
                  직무 선택…
                </option>
                {Object.entries(JOB_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {jobSaving && <span className="section-sub job-role-msg">저장 중…</span>}
            {!jobSaving && jobMessage && (
              <span className={`job-role-msg${jobMessageOk ? '' : ' bad'}`}>{jobMessage}</span>
            )}
          </div>
        )}
      </header>
      {error && <div className="error-banner">{error}</div>}
      {sessions && sessions.length === 0 && (
        <div className="card empty-card">
          <p>아직 연습 기록이 없어요. 첫 연습을 마치면 여기에서 결과를 볼 수 있습니다.</p>
        </div>
      )}
      {sessions?.map((s) => (
        <article key={s.id} className="card result-card">
          <div className="result-card-main">
            <div className="result-card-title">
              <strong>{s.scenario_title}</strong>
              <span className="result-card-meta">
                {jobRoleLabel(s.job_role)} · {difficultyLabel(s.difficulty)} ·{' '}
                {formatDateTime(s.started_at)}
              </span>
            </div>
            <div className="result-card-grade">
              <GradeBadge grade={s.grade} large />
              {s.status !== 'completed' && (
                <span className="result-card-status">{statusLabel(s.status)}</span>
              )}
              {/* 원점수는 검증 전 참고값 — 보조 소자로만 작게 (S-B2B-112) */}
              {s.total_score !== null && (
                <span className="score-sub">원점수 {Math.round(s.total_score)} (참고)</span>
              )}
            </div>
          </div>
          <FitMiniBars fits={s.fit_scores} />
        </article>
      ))}
      {sessions === null && !error && <p className="section-sub">불러오는 중…</p>}
    </div>
  );
}
