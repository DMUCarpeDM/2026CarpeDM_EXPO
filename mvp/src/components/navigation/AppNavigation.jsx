import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { Menu4 } from "reicon-react/icons/Menu4";
import { X } from "reicon-react/icons/X";
import { IconGlyph } from "../ui/IconGlyph";
import { navMap, practiceNavMap } from "./navigationConfig";

const mobileIconByTarget = {
  usage: "coach",
  intro: "presentation",
  service: "roleplay",
  records: "report",
  result: "report",
};

export function TopNav({ active, scenarioTitle, menuOpen, onMenuOpen, onNavigate, scenarios = [], onScenarioSelect, practiceMode = false, account, onLogout }) {
  const [scenarioOpen, setScenarioOpen] = useState(false);

  useEffect(() => {
    const handleOutsideClick = () => {
      setScenarioOpen(false);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const toggleScenario = (event) => {
    event.stopPropagation();
    setScenarioOpen(!scenarioOpen);
  };

  const currentNavMap = practiceMode ? practiceNavMap : navMap;

  return (
    <header className="top-nav glass-panel" onKeyDown={(event) => {
      if (event.key !== "Escape" || !scenarioOpen) return;
      event.preventDefault();
      setScenarioOpen(false);
      event.target.closest(".nav-dropdown-wrapper")?.querySelector("button")?.focus();
    }}>
      <button className="brand" type="button" aria-label="Mirror-Ting 모드 선택" onClick={() => onNavigate("service")}>
        <span className="brand-mark brand-mark--mirror" aria-hidden="true"><img src="/icons/mirror-ting-mark-slim.png" alt="" /></span><span>Mirror-Ting</span>
      </button>
      <nav aria-label="주요 화면">
        {Object.entries(currentNavMap).map(([label, target]) => <button key={label} className={active === target ? "active" : ""} aria-current={active === target ? "page" : undefined} type="button" onClick={() => onNavigate(target)}>{label}</button>)}
      </nav>
      <div className="nav-actions">
        {active === "practice" && (
          <div className="nav-dropdown-wrapper">
            <button className="scenario-select" type="button" aria-expanded={scenarioOpen} onClick={toggleScenario}>{scenarioTitle || "역할극"} <ChevronDown size={16} /></button>
            {scenarioOpen && scenarios.length > 0 && <div className="nav-dropdown scenario-dropdown glass-panel" onClick={(event) => event.stopPropagation()}><h3>시나리오 전환</h3><ul>{scenarios.map((scenario) => <li key={scenario.slug} className={scenario.title === scenarioTitle ? "active" : ""}><button type="button" onClick={() => { onScenarioSelect(scenario.slug); setScenarioOpen(false); }}>{scenario.title}</button></li>)}</ul></div>}
          </div>
        )}
        {account ? <><span className="nav-account-name">{account.name || account.email}</span><button className="nav-auth-button nav-auth-login" type="button" onClick={onLogout}>로그아웃</button></> : <><button className="nav-auth-button nav-auth-login" type="button" onClick={() => onNavigate("login")}>로그인</button><button className="nav-auth-button nav-auth-signup" type="button" onClick={() => onNavigate("signup")}>회원가입</button></>}
        <button className="mobile-menu-button" type="button" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => onMenuOpen(true)}><Menu4 size={22} /></button>
      </div>
    </header>
  );
}

export function MobileMenuSheet({ open, active, onClose, onNavigate, practiceMode = false }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector(".sheet-head button").focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const buttons = dialogRef.current.querySelectorAll(".mobile-menu-sheet button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog onKeyDown={handleKeyDown} ref={dialogRef} className={`mobile-menu-layer ${open ? "open" : ""}`} aria-label="모바일 메뉴" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button className="mobile-menu-backdrop" type="button" tabIndex={-1} aria-label="메뉴 닫기" onClick={onClose} />
      <section className="mobile-menu-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><strong>Mirror-Ting</strong><button type="button" autoFocus aria-label="메뉴 닫기" onClick={onClose}><X size={20} /></button></div>
        <nav aria-label="모바일 주요 화면">{Object.entries(practiceMode ? practiceNavMap : navMap).map(([label, target]) => <button key={label} className={active === target ? "active" : ""} aria-current={active === target ? "page" : undefined} type="button" onClick={() => onNavigate(target)}><IconGlyph icon={mobileIconByTarget[target] || "coach"} size={23} /><span>{label}</span><ArrowRight size={17} /></button>)}</nav>
      </section>
    </dialog>
  );
}
