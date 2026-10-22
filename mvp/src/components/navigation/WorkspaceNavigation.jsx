import { useState } from "react";
function WorkspaceIcon({ name }) {
  const paths = { home: 'M12 5v14M5 12h14', records: 'M8 3H5v18h14V3h-3M9 3h6v4H9zM8 12h8M8 16h6', usage: 'M4 4h6c2 0 2 1 2 2v15c0-2-2-3-4-3H4V4ZM20 4h-6c-2 0-2 1-2 2v15c0-2 2-3 4-3h4V4Z', pricing: 'M3 5h18v14H3zM3 10h18M7 15h3', menu: 'M4 6h16M4 12h16M4 18h16', chevron: 'm8 10 4 4 4-4' };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.records} /></svg>;
}
export function WorkspaceNavigation({ active, account, onNavigate, onLogout }) {
  const [open, setOpen] = useState(false);
  const go = id => { onNavigate(id); setOpen(false); };
  return <>
    <header className="workspace-mobile-header"><button type="button" aria-label="연습 공간 메뉴 열기" aria-expanded={open} onClick={() => setOpen(!open)}><WorkspaceIcon name="menu" /></button><span>Mirror-Ting</span><button type="button" onClick={() => go("home")}><WorkspaceIcon name="home" /> 새 연습</button></header>
    <nav className="workspace-mobile-dock" aria-label="빠른 이동">{[["home","홈","⌂"],["records","연습 기록","▦"],["usage","사용방법","◇"]].map(([id,label,icon]) => <button type="button" key={id} aria-label={label} aria-current={active === id ? "page" : undefined} onClick={() => go(id)}><WorkspaceIcon name={id} /></button>)}</nav>
    {open && <button className="workspace-backdrop" aria-label="메뉴 닫기" onClick={() => setOpen(false)} />}
    <aside className={`workspace-navigation ${open ? "is-open" : ""}`} aria-label="내 연습 공간">
      <button className="workspace-brand" type="button" onClick={() => go("home")}><img src="/icons/mirror-ting-mark-slim.png" alt="" width="28" height="28" />Mirror-Ting</button>
      <div className="workspace-selector">나의 연습 공간 <WorkspaceIcon name="chevron" /></div>
      <nav aria-label="연습 공간 메뉴">{[["home","새 연습","＋"],["records","연습 기록","⌕"],["usage","사용방법","◇"],["pricing","요금제","▦"]].map(([id,label,icon])=><button key={id} type="button" aria-current={active===id || (id==='home' && active==='service') ? "page" : undefined} onClick={()=>go(id)}><WorkspaceIcon name={id} />{label}</button>)}</nav>
      <div className="workspace-recent"><span>최근</span><button type="button" onClick={() => go("records")}><WorkspaceIcon name="records" />모든 연습 기록</button></div>
      <button className="workspace-upgrade" type="button" onClick={() => go("pricing")}><strong>더 많은 대화 연습</strong><small>요금제 알아보기 ↗</small></button>
      <div className="workspace-account">{account ? <details><summary>{account.name || "내 계정"}</summary><p>{account.email}</p><button type="button" onClick={onLogout}>로그아웃</button></details> : <button type="button" onClick={()=>go("login")}>로그인</button>}</div>
    </aside>
  </>;
}
