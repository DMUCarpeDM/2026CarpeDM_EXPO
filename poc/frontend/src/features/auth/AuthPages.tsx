import { isAxiosError } from 'axios';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login, signup } from '../../api/client';
import ConsentNotice, { EMPTY_CONSENT } from '../../components/ConsentNotice';
import type { ConsentState } from '../../components/ConsentNotice';
import { useAuthStore } from '../../stores/authStore';

/** ?next=/claim?token=… 지원 — 로그인 후 원래 가려던 화면으로 복귀 (클레임 흐름).
 * 내부 경로만 허용해 오픈 리다이렉트를 막는다. */
function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next') ?? '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await signup(email, password, name, inviteCode.trim());
      else await login(email, password);
      await useAuthStore.getState().load(); // 네비게이션의 내 결과·기관 링크 즉시 갱신
      navigate(nextPath(location.search));
    } catch (err: unknown) {
      // 초대 코드 불일치는 404 — 계정 자체가 만들어지지 않았음을 분명히 알린다 (S-B2B-118)
      if (mode === 'signup' && isAxiosError(err) && err.response?.status === 404 && inviteCode.trim()) {
        setError('초대 코드가 올바르지 않습니다. 코드를 확인해 주세요. (계정은 만들어지지 않았어요)');
      } else {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(detail ?? '요청에 실패했습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  // 회원가입은 동의 안내 확인(필수 체크)이 있어야 제출 가능 (D-14)
  const blocked = mode === 'signup' && !consent.confirmed;
  const next = nextPath(location.search);
  const nextQuery = next !== '/' ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <div className="page auth">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{mode === 'login' ? '로그인' : '회원가입'}</h1>
        <p className="section-sub">
          계정을 만들면 세션 히스토리와 리포트를 이어서 볼 수 있어요. (전시 체험은 로그인 없이 가능)
        </p>
        {mode === 'signup' && (
          <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="비밀번호 (8자 이상)"
          value={password}
          required
          minLength={8}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === 'signup' && (
          <>
            <input
              placeholder="초대 코드 (선택)"
              value={inviteCode}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setInviteCode(e.target.value)}
            />
            <p className="section-sub invite-hint">
              초대 코드가 있으면 기관에 자동 소속됩니다. 교육 담당자에게 받은 코드를 입력하세요.
            </p>
            <ConsentNotice value={consent} onChange={setConsent} />
          </>
        )}
        {error && <div className="error-banner">{error}</div>}
        <button className="primary-btn" disabled={busy || blocked}>
          {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
        {blocked && (
          <p className="section-sub invite-hint">
            가입하려면 개인정보 수집·이용 안내 확인(필수)에 체크해 주세요.
          </p>
        )}
        <p className="auth-switch">
          {mode === 'login' ? (
            <>계정이 없나요? <Link to={`/signup${nextQuery}`}>회원가입</Link></>
          ) : (
            <>이미 계정이 있나요? <Link to={`/login${nextQuery}`}>로그인</Link></>
          )}
        </p>
      </form>
    </div>
  );
}

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function SignupPage() {
  return <AuthForm mode="signup" />;
}
