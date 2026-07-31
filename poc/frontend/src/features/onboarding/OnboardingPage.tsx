import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimCode, createSession, getScenarios } from '../../api/client';
import type { Scenario } from '../../api/types';
import ondoMark from '../../assets/brand/cafe-ondo-mark.svg';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { JOB_ROLE_LABELS, brandLabel, domainLabel, jobRoleLabel } from '../../lib/b2b';
import { useMirrorMode } from '../../lib/mirrorMode';
import { useAuthStore } from '../../stores/authStore';
import { useSessionStore } from '../../stores/sessionStore';
import OnboardingMirrorView from './OnboardingMirrorView';

/** 시나리오의 직무 그룹 키 — job_role이 빈 시나리오는 "공통" 그룹 (S-B2B-PACK) */
const COMMON_GROUP = 'common';

function groupOf(s: Scenario): string {
  return s.job_role || COMMON_GROUP;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const mirror = useMirrorMode();
  const me = useAuthStore((s) => s.me);
  const setSession = useSessionStore((s) => s.setSession);
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [jobTab, setJobTab] = useState('all'); // 'all' | 직무 코드 | 'common'
  const [selectedSlug, setSelectedSlug] = useState('');
  const [mode, setMode] = useState<5 | 10>(5);
  const [difficulty, setDifficulty] = useState<'basic' | 'pressure'>('basic');
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeMessage, setCodeMessage] = useState('');
  // 사용자가 직무 탭·시나리오를 직접 만졌으면 로그인 정보 도착이 선택을 덮지 않는다
  const userTouched = useRef(false);

  async function linkCode() {
    if (codeInput.trim().length < 4) return;
    try {
      await claimCode(codeInput.trim());
      setCodeMessage('기록이 연결됐습니다. 이번 결과부터 성장 추이에 이어집니다.');
    } catch {
      setCodeMessage('등록되지 않은 코드예요. 리포트 화면의 코드를 다시 확인해주세요.');
    }
  }

  useEffect(() => {
    getScenarios()
      .then(setScenarios)
      .catch(() => setError('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.'));
  }, []);

  // 로그인 사용자의 직무가 있으면 해당 직무 탭을 기본 선택 (S-B2B-PACK)
  useEffect(() => {
    if (userTouched.current || !scenarios || !me?.job_role) return;
    if (scenarios.some((s) => s.job_role === me.job_role)) setJobTab(me.job_role);
  }, [scenarios, me]);

  // 직무 탭 구성 — 전체 → 직무(라벨 순서) → 공통, 시나리오가 있는 그룹만
  const groups = new Set((scenarios ?? []).map(groupOf));
  const tabs: { value: string; label: string }[] = [
    { value: 'all', label: '전체' },
    ...Object.entries(JOB_ROLE_LABELS)
      .filter(([value]) => groups.has(value))
      .map(([value, label]) => ({ value, label })),
    ...(groups.has(COMMON_GROUP) ? [{ value: COMMON_GROUP, label: '공통' }] : []),
  ];

  const visible = (scenarios ?? []).filter((s) => jobTab === 'all' || groupOf(s) === jobTab);
  // 탭 전환으로 선택이 목록에서 사라지면 첫 항목으로 자연 복귀
  const selected = visible.find((s) => s.slug === selectedSlug) ?? visible[0] ?? null;

  async function start() {
    if (!agreed || starting) return;
    setStarting(true);
    try {
      // 직무 축에서 고른 시나리오의 slug를 그대로 전달 — 직무는 서버가 시나리오에서 도출
      const session = await createSession({
        mode,
        difficulty,
        agreed,
        scenarioSlug: selected?.slug,
      });
      setSession(session);
      navigate(`/roleplay/${session.id}`);
    } catch {
      setError('세션을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
      setStarting(false);
    }
  }

  // 미러 모드 — 3탭 온보딩 (동의는 버튼 = 동의). 전시 기본 시나리오(첫 항목) 유지
  if (mirror) {
    return (
      <OnboardingMirrorView
        scenario={scenarios?.[0] ?? null}
        error={error}
        starting={starting}
        onStart={async (m, d) => {
          if (starting) return;
          setStarting(true);
          try {
            const session = await createSession({ mode: m, difficulty: d, agreed: true });
            setSession(session);
            navigate(`/roleplay/${session.id}`);
          } catch {
            setError('세션을 시작하지 못했어요. 운영자를 불러주세요.');
            setStarting(false);
          }
        }}
      />
    );
  }

  return (
    <div className="page onboarding">
      <header className="hero">
        <p className="hero-badge">4-Fit 미러팅 · AI 직장생활 시뮬레이션</p>
        <h1>
          오늘, <span className="accent">{selected?.world_setting.company ?? '㈜클라우드밋'}</span>에
          입사했습니다
        </h1>
        <p className="hero-sub">
          {selected?.world_setting.situation ??
            'AI 상사·선배·동료와 직장 상황 역할극을 하고, 응답·말하기·시선·자세 4가지 피드백을 받아보세요.'}
        </p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {scenarios && scenarios.length > 0 && (
        <section className="card">
          <h2>직무·시나리오 선택</h2>
          <p className="section-sub">
            연습할 직무를 고르면 맞는 시나리오만 보여요. 로그인하고 직무를 설정하면 다음부터 자동으로
            선택됩니다.
          </p>
          <div className="job-tabs">
            {tabs.map((t) => (
              <button
                key={t.value}
                className={`job-tab${jobTab === t.value ? ' active' : ''}`}
                aria-pressed={jobTab === t.value}
                onClick={() => {
                  userTouched.current = true;
                  setJobTab(t.value);
                }}
              >
                {t.label}
                {me?.job_role === t.value && <span className="myjob-badge">내 직무</span>}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="section-sub">이 직무의 시나리오가 아직 없어요. 다른 탭을 선택해 주세요.</p>
          ) : (
            <div className="scenario-grid">
              {visible.map((s) => (
                <button
                  key={s.slug}
                  className={`scenario-card${selected?.slug === s.slug ? ' active' : ''}`}
                  aria-pressed={selected?.slug === s.slug}
                  onClick={() => {
                    userTouched.current = true;
                    setSelectedSlug(s.slug);
                  }}
                >
                  <span className="scenario-chips">
                    <span className="scenario-chip role">
                      {s.job_role ? jobRoleLabel(s.job_role) : '공통'}
                    </span>
                    {s.domain && <span className="scenario-chip">{domainLabel(s.domain)}</span>}
                    {s.brand === 'cafe-ondo' && (
                      <span className="scenario-chip brand">
                        <img src={ondoMark} alt="" />
                        {brandLabel(s.brand)}
                      </span>
                    )}
                  </span>
                  <strong>{s.title}</strong>
                  <p>{s.description}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {selected && (
        <section className="card">
          <h2>오늘 만날 사람들</h2>
          <div className="character-grid">
            {selected.characters.map((c) => (
              <div key={c.id} className="character-card">
                <Avatar characterId={c.id} name={c.name} size={44} />
                <strong>{c.name}</strong>
                <span className="character-role">{c.role}</span>
                <p className="character-personality">{c.personality}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>체험 설정</h2>
        <div className="option-row">
          <span className="option-label">데모 길이</span>
          <div className="segmented">
            <button className={mode === 5 ? 'active' : ''} onClick={() => setMode(5)}>
              5분 · 핵심 {selected ? selected.episode_titles['5'].length : 3}개 상황
            </button>
            <button className={mode === 10 ? 'active' : ''} onClick={() => setMode(10)}>
              10분 · 전체 {selected ? selected.episode_titles['10'].length : 5}개 상황
            </button>
          </div>
        </div>
        <div className="option-row">
          <span className="option-label">난이도</span>
          <div className="segmented">
            <button
              className={difficulty === 'basic' ? 'active' : ''}
              onClick={() => setDifficulty('basic')}
            >
              기본
            </button>
            <button
              className={difficulty === 'pressure' ? 'active' : ''}
              onClick={() => setDifficulty('pressure')}
            >
              압박 질문 포함
            </button>
          </div>
        </div>
        {selected && (
          <ol className="episode-preview">
            {selected.episode_titles[String(mode)].map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ol>
        )}
      </section>

      <section className="card consent-card">
        <h2>개인정보 안내</h2>
        <ul className="consent-list">
          <li>마이크·카메라 입력은 <strong>분석 목적으로만 실시간 처리</strong>됩니다.</li>
          <li>영상은 <strong>서버로 전송·저장되지 않으며</strong>, 브라우저 안에서 시선·자세 지표만 계산됩니다.</li>
          <li>음성·텍스트는 리포트 생성 후 정책에 따라 처리됩니다 (기본: 저장 안 함).</li>
        </ul>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          위 내용을 확인했고, 체험을 위한 실시간 분석에 동의합니다.
        </label>
      </section>

      <button className="primary-btn start-btn" disabled={!agreed || starting} onClick={start}>
        {starting ? '입장 중…' : '출근하기 →'}
      </button>

      <details className="code-link">
        <summary>
          <Icon name="key" size={14} /> 지난 기록 이어서 하기 (체험 코드 입력)
        </summary>
        <div className="code-link-row">
          <input
            className="code-input"
            placeholder="예: A3K7"
            maxLength={6}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && linkCode()}
          />
          <button className="ghost-btn" onClick={linkCode}>연결</button>
        </div>
        {codeMessage && <p className="section-sub">{codeMessage}</p>}
      </details>
    </div>
  );
}
