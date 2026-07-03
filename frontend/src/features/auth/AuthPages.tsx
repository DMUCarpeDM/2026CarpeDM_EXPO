import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, signup } from '../../api/client';

function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await signup(email, password, name);
      else await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

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
        {error && <div className="error-banner">{error}</div>}
        <button className="primary-btn" disabled={busy}>
          {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
        <p className="auth-switch">
          {mode === 'login' ? (
            <>계정이 없나요? <Link to="/signup">회원가입</Link></>
          ) : (
            <>이미 계정이 있나요? <Link to="/login">로그인</Link></>
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
