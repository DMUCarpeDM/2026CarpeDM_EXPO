import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimCode, createSession, getScenarios } from '../../api/client';
import type { Scenario } from '../../api/types';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { useMirrorMode } from '../../lib/mirrorMode';
import { useSessionStore } from '../../stores/sessionStore';
import OnboardingMirrorView from './OnboardingMirrorView';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const mirror = useMirrorMode();
  const setSession = useSessionStore((s) => s.setSession);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [mode, setMode] = useState<5 | 10>(5);
  const [difficulty, setDifficulty] = useState<'basic' | 'pressure'>('basic');
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeMessage, setCodeMessage] = useState('');

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
      .then((list) => setScenario(list[0] ?? null))
      .catch(() => setError('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.'));
  }, []);

  async function start() {
    if (!agreed || starting) return;
    setStarting(true);
    try {
      const session = await createSession({ mode, difficulty, agreed });
      setSession(session);
      navigate(`/roleplay/${session.id}`);
    } catch {
      setError('세션을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
      setStarting(false);
    }
  }

  // 미러 모드 — 3탭 온보딩 (동의는 버튼 = 동의)
  if (mirror) {
    return (
      <OnboardingMirrorView
        scenario={scenario}
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
          오늘, <span className="accent">㈜클라우드밋</span>에
          <br />
          입사했습니다
        </h1>
        <p className="hero-sub">
          {scenario?.world_setting.situation ??
            'AI 상사·선배·동료와 직장 상황 역할극을 하고, 응답·말하기·시선·자세 4가지 피드백을 받아보세요.'}
        </p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {scenario && (
        <section className="card">
          <h2>오늘 만날 사람들</h2>
          <div className="character-grid">
            {scenario.characters.map((c) => (
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
              5분 · 핵심 {scenario ? scenario.episode_titles['5'].length : 3}개 상황
            </button>
            <button className={mode === 10 ? 'active' : ''} onClick={() => setMode(10)}>
              10분 · 전체 {scenario ? scenario.episode_titles['10'].length : 5}개 상황
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
        {scenario && (
          <ol className="episode-preview">
            {scenario.episode_titles[String(mode)].map((title) => (
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
