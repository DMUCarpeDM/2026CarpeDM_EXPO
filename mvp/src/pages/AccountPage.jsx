import { useRef, useState } from "react";
import { authenticate, DEMO_AUTH, startDemoAccount } from "../lib/accountApi";

export function AccountPage({ kind, onNavigate, onAuthenticated, pendingPrompt = "" }) {
  const signup = kind === "signup";
  const form = useRef(null);
  const [socialNotice, setSocialNotice] = useState("");
  const [emailStep, setEmailStep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const continueDemo = () => onAuthenticated(startDemoAccount());
  const submit = async event => {
    event.preventDefault();
    if (DEMO_AUTH) { continueDemo(); return; }
    if (emailStep) { setEmailStep(false); return; }
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError(""); setBusy(true);
    try { onAuthenticated(await authenticate(kind, values)); setDone(true); }
    catch (failure) {
      setError(failure instanceof TypeError ? "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요." : failure.message || "입력한 정보를 확인한 뒤 다시 시도해주세요.");
      window.requestAnimationFrame(() => form.current?.querySelector("input[name=email]")?.focus());
    }
    finally { setBusy(false); }
  };
  return <section className="page account-page lovable-auth" aria-labelledby="account-title">
    <div className="auth-form-column"><div className="account-card">
      <button type="button" className="auth-brand" onClick={() => onNavigate("home")} aria-label="Mirror-Ting 홈으로"><img src="/icons/mirror-ting-mark-slim.png" alt="" width="32" height="32" /><span>Mirror-Ting</span></button>

      <h1 id="account-title">{done ? signup ? "회원가입을 마쳤어요" : "로그인했어요" : signup ? "회원가입" : "로그인"}</h1>
      {done ? <><p>연습할 상황을 적고 AI와 대화를 나눠보세요.</p><button className="account-submit" type="button" onClick={() => onNavigate("home")}>연습할 상황 적기</button></> : <>
        <p>{signup ? "계정을 만들고 원하는 대화를 연습해보세요." : "다음 대화를 함께 준비해요."}</p>
        {emailStep && <>
          <div className="auth-social-options" aria-label="간편로그인">
            {[['google', '구글'], ['naver', '네이버'], ['kakao', '카카오']].map(([provider, name]) => <button key={provider} type="button" className={`auth-social-button auth-social-${provider}`} onClick={() => DEMO_AUTH ? continueDemo() : setSocialNotice(`${name} 로그인은 준비 중이에요. 이메일로 계속해주세요.`)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{provider === 'google' ? <><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.93a6 6 0 0 1 0-3.86V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59A5.98 5.98 0 0 1 12 5.95Z"/></> : provider === 'naver' ? <path fill="currentColor" d="M4 4h5.4l5.2 7.6V4H20v16h-5.4l-5.2-7.6V20H4Z"/> : <path fill="currentColor" d="M12 3C6.48 3 2 6.5 2 10.8c0 2.76 1.84 5.18 4.6 6.57L5.5 21l4.25-2.58c.73.13 1.48.18 2.25.18 5.52 0 10-3.49 10-7.8S17.52 3 12 3Z"/>}</svg>
              <span>{name}로 계속하기</span>
            </button>)}
          </div>
          {socialNotice && <p className="auth-social-notice" role="status">{socialNotice}</p>}
          <div className="auth-method-label">또는 이메일로 계속하기</div>
        </>}
        <form noValidate={DEMO_AUTH} ref={form} onSubmit={submit} onInput={() => setError("")}>
          <fieldset disabled={busy}>
            {!emailStep && signup && <label>이름<input name="name" autoComplete="name" maxLength={100} required /></label>}
            <label>이메일<input name="email" type="email" autoComplete="email" aria-invalid={error.includes("이메일") || undefined} aria-describedby={error ? "account-error" : undefined} required /></label>
            {!emailStep && <label>비밀번호<input name="password" type="password" minLength={signup ? 8 : undefined} autoComplete={signup ? "new-password" : "current-password"} aria-invalid={error.includes("비밀번호") || undefined} aria-describedby={error ? "account-error" : undefined} required />{signup && <small>비밀번호는 8자 이상으로 만들어주세요.</small>}</label>}
            {error && <p className="account-error" id="account-error" role="alert">{error}</p>}
            <button className="account-submit" type="submit"><span>{emailStep ? "계속하기" : busy ? signup ? "회원가입하고 있어요" : "로그인하고 있어요" : signup ? "회원가입하기" : "로그인"}</span></button>
          </fieldset>
        </form>
        <button type="button" className="account-switch" disabled={busy} onClick={() => onNavigate(signup ? "login" : "signup")}>{signup ? "계정이 있다면 로그인하기" : "계정 만들기"}</button>
      </>}
    </div></div>
    <aside className="auth-visual prompt-home-hero" aria-label="연습할 상황">
      <div className="auth-visual-composer"><p>{pendingPrompt || "Mirror-Ting에게 요청해 보세요: 내일 면접을 연습하고 싶어요."}<span className="auth-visual-caret" aria-hidden="true" /></p><span className="auth-visual-arrow" aria-hidden="true">↑</span></div>
      {pendingPrompt && <p className="auth-visual-note">입력한 상황은 {signup ? "회원가입" : "로그인"} 후 연습 화면으로 이어집니다.</p>}
    </aside>
  </section>;
}
