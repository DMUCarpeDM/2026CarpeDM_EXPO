import { useRef, useState } from "react";
import { authenticate } from "../lib/accountApi";

export function AccountPage({ kind, onNavigate, onAuthenticated }) {
  const signup = kind === "signup";
  const form = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError(""); setBusy(true);
    try { onAuthenticated(await authenticate(kind, values)); setDone(true); }
    catch (failure) {
      setError(failure instanceof TypeError ? "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요." : failure.message || "입력한 정보를 확인한 뒤 다시 시도해주세요.");
      window.requestAnimationFrame(() => form.current?.querySelector("input[name=email]")?.focus());
    }
    finally { setBusy(false); }
  };
  return <section className="page account-page" aria-labelledby="account-title">
    <div className="account-card">
      <h1 id="account-title">{done ? signup ? "회원가입을 마쳤어요" : "로그인했어요" : signup ? "회원가입" : "로그인"}</h1>
      {done ? <><p>연습할 상황을 적고 AI와 대화를 나눠보세요.</p><button className="account-submit" type="button" onClick={() => onNavigate("home")}>연습할 상황 적기</button></> : <>
        <p>{signup ? "이름과 이메일, 비밀번호를 입력해주세요." : "이메일과 비밀번호를 입력해주세요."}</p>
        <form ref={form} onSubmit={submit} onInput={() => setError("")}>
          <fieldset disabled={busy}>
            {signup && <label>이름<input name="name" autoComplete="name" maxLength={100} required /></label>}
            <label>이메일<input name="email" type="email" autoComplete="email" aria-invalid={error.includes("이메일") || undefined} aria-describedby={error ? "account-error" : undefined} required /></label>
            <label>비밀번호<input name="password" type="password" minLength={signup ? 8 : undefined} autoComplete={signup ? "new-password" : "current-password"} aria-invalid={error.includes("비밀번호") || undefined} aria-describedby={error ? "account-error" : undefined} required />{signup && <small>비밀번호는 8자 이상으로 만들어주세요.</small>}</label>
            {error && <p className="account-error" id="account-error" role="alert">{error}</p>}
            <button className="account-submit" type="submit">{busy ? signup ? "회원가입하고 있어요" : "로그인하고 있어요" : signup ? "회원가입하기" : "로그인"}</button>
          </fieldset>
        </form>
        <button type="button" className="account-switch" disabled={busy} onClick={() => onNavigate(signup ? "login" : "signup")}>{signup ? "계정이 있다면 로그인하기" : "계정 만들기"}</button>
      </>}
    </div>
  </section>;
}
