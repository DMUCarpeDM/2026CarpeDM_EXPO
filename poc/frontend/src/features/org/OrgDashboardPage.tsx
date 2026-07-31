/** 기관 관리자 대시보드 v1 (D-15, S-B2B-114) — 읽기 전용.
 * 기관 요약(초대 코드 회전 포함) + 수강생 목록 + 세션 결과 테이블(직무 필터·페이지네이션).
 * 점수 표기 방침(S-B2B-112): 관리자에게는 원점수+등급 병기 — 단 원점수가
 * human agreement 검증 전 값임을 화면에 명시한다. 세션 상세 화면은 v1 범위 밖. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getOrgDetail,
  getOrgMembers,
  getOrgSessions,
  rotateOrgInvites,
} from '../../api/client';
import type { OrgDetail, OrgMember, OrgSessionList } from '../../api/types';
import ondoMark from '../../assets/brand/cafe-ondo-mark.svg';
import { GradeBadge } from '../../components/GradeBadge';
import {
  JOB_ROLE_LABELS,
  difficultyLabel,
  formatDateTime,
  jobRoleLabel,
  orgRoleLabel,
  statusLabel,
} from '../../lib/b2b';
import { useAuthStore } from '../../stores/authStore';

const PAGE_SIZE = 50; // 세션 테이블 페이지 크기 (v1 고정)

/** 접근 불가 안내 — 미로그인·비매니저·무소속 공용 골격 */
function AccessNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="page auth">
      <div className="card auth-card">
        <h1>기관 대시보드</h1>
        {children}
      </div>
    </div>
  );
}

export default function OrgDashboardPage() {
  const me = useAuthStore((s) => s.me);
  const loadMe = useAuthStore((s) => s.load);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [sessions, setSessions] = useState<OrgSessionList | null>(null);
  const [jobRole, setJobRole] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const orgId = me?.org_role === 'manager' ? me.institution_id : null;

  // 기관 요약·수강생 목록 — 최초 1회
  useEffect(() => {
    if (orgId === null || orgId === undefined) return;
    getOrgDetail(orgId)
      .then(setOrg)
      .catch(() => setError('기관 정보를 불러오지 못했습니다.'));
    getOrgMembers(orgId)
      .then(setMembers)
      .catch(() => setError('수강생 목록을 불러오지 못했습니다.'));
  }, [orgId]);

  // 세션 테이블 — 필터·페이지 변경 시 재조회
  useEffect(() => {
    if (orgId === null || orgId === undefined) return;
    getOrgSessions(orgId, { jobRole, limit: PAGE_SIZE, offset })
      .then(setSessions)
      .catch(() => setError('세션 목록을 불러오지 못했습니다.'));
  }, [orgId, jobRole, offset]);

  const rotate = useCallback(async () => {
    if (orgId === null || orgId === undefined || rotating) return;
    if (!window.confirm('초대 코드를 회전할까요? 기존 코드는 즉시 만료됩니다.')) return;
    setRotating(true);
    try {
      setOrg(await rotateOrgInvites(orgId));
    } catch {
      setError('초대 코드 회전에 실패했습니다.');
    } finally {
      setRotating(false);
    }
  }, [orgId, rotating]);

  if (me === undefined) {
    return (
      <AccessNotice>
        <p className="section-sub">계정 정보를 확인하는 중…</p>
      </AccessNotice>
    );
  }
  if (me === null) {
    return (
      <AccessNotice>
        <p className="section-sub">기관 대시보드는 로그인한 관리자만 볼 수 있습니다.</p>
        <Link className="primary-btn" to="/login?next=%2Forg">로그인하러 가기</Link>
      </AccessNotice>
    );
  }
  if (me.org_role !== 'manager') {
    return (
      <AccessNotice>
        <p className="section-sub">
          이 화면은 기관 관리자 전용입니다. 현재 계정 권한은{' '}
          <strong>{orgRoleLabel(me.org_role)}</strong>예요. 관리자 권한이 필요하면 소속
          기관의 교육 담당자에게 문의해 주세요.
        </p>
        <Link className="ghost-btn" to="/me/results">내 결과 보러 가기</Link>
      </AccessNotice>
    );
  }
  if (orgId === null || orgId === undefined) {
    return (
      <AccessNotice>
        <p className="section-sub">소속된 기관이 없습니다. 초대 코드로 기관에 먼저 소속해 주세요.</p>
      </AccessNotice>
    );
  }

  const totalPages = sessions ? Math.max(1, Math.ceil(sessions.total / PAGE_SIZE)) : 1;
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="page org-dashboard">
      <header className="b2b-page-header">
        <div className="b2b-brand-row">
          {/* 카페 온도 — 훈련 무대 브랜드 심벌 (전체 앱 리브랜딩 아님) */}
          <img src={ondoMark} alt="카페 온도 심벌" className="b2b-brand-mark" />
          <div>
            <h1>기관 대시보드</h1>
            <p className="section-sub">{org ? org.name : '기관 정보를 불러오는 중…'} · 읽기 전용 v1</p>
          </div>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}

      {org && (
        <section className="card org-summary">
          <h2>기관 요약</h2>
          <div className="org-summary-grid">
            <div className="metric-card">
              <span className="metric-value">{org.name}</span>
              <span className="metric-label">기관명</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">{org.member_count}</span>
              <span className="metric-label">소속 인원</span>
            </div>
          </div>
          <div className="invite-block">
            <div className="invite-list">
              {org.invites.map((inv) => (
                <span key={inv.code} className={`invite-code ${inv.is_active ? '' : 'inactive'}`}>
                  <strong>{inv.code}</strong>
                  <em>{orgRoleLabel(inv.org_role)}용{inv.is_active ? '' : ' · 만료'}</em>
                </span>
              ))}
              {org.invites.length === 0 && (
                <span className="section-sub">발급된 초대 코드가 없습니다.</span>
              )}
            </div>
            <button className="ghost-btn" onClick={rotate} disabled={rotating}>
              {rotating ? '회전 중…' : '초대 코드 회전'}
            </button>
          </div>
          <p className="section-sub">* 코드를 회전하면 기존 코드는 즉시 만료되고 새 코드가 발급됩니다.</p>
        </section>
      )}

      <section className="card">
        <h2>수강생 목록</h2>
        {members === null ? (
          <p className="section-sub">불러오는 중…</p>
        ) : members.length === 0 ? (
          <p className="section-sub">아직 소속 수강생이 없습니다. 초대 코드를 공유해 주세요.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>이메일</th>
                  <th>직무</th>
                  <th>연습 횟수</th>
                  <th>최근 연습</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name || '—'}
                      {m.org_role === 'manager' && <span className="role-chip">관리자</span>}
                    </td>
                    <td>{m.email}</td>
                    <td>{jobRoleLabel(m.job_role)}</td>
                    <td>{m.session_count}</td>
                    <td>{formatDateTime(m.last_session_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>세션 결과</h2>
        <div className="filter-row">
          <label>
            직무 필터{' '}
            <select value={jobRole} onChange={(e) => { setJobRole(e.target.value); setOffset(0); }}>
              <option value="">전체 직무</option>
              {Object.entries(JOB_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {sessions && <span className="section-sub filter-total">총 {sessions.total}건</span>}
        </div>
        {sessions === null ? (
          <p className="section-sub">불러오는 중…</p>
        ) : sessions.items.length === 0 ? (
          <p className="section-sub">조건에 맞는 세션이 없습니다.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>수강생</th>
                  <th>직무</th>
                  <th>시나리오</th>
                  <th>난이도</th>
                  <th>상태</th>
                  <th>등급 · 원점수</th>
                  <th>시작 일시</th>
                </tr>
              </thead>
              <tbody>
                {sessions.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.user_name || '—'}
                      <span className="cell-sub">{s.user_email}</span>
                    </td>
                    <td>{jobRoleLabel(s.job_role)}</td>
                    <td>{s.scenario_title}</td>
                    <td>{difficultyLabel(s.difficulty)}</td>
                    <td>{statusLabel(s.status)}</td>
                    <td>
                      <GradeBadge grade={s.grade} />
                      {s.total_score !== null && (
                        <span className="score-sub">{Math.round(s.total_score)}점</span>
                      )}
                    </td>
                    <td>{formatDateTime(s.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <button
            className="ghost-btn"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            이전
          </button>
          <span className="section-sub">{page} / {totalPages} 페이지</span>
          <button
            className="ghost-btn"
            disabled={sessions === null || offset + PAGE_SIZE >= sessions.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            다음
          </button>
        </div>
        <p className="section-sub">
          * 원점수는 채점 일치도(human agreement) 검증 전 값으로, 기관 내부 확인용입니다.
          수강생 화면에는 등급만 표기됩니다.
        </p>
      </section>
    </div>
  );
}
