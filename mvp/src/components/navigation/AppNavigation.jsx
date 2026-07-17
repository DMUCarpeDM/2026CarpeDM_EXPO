import { useEffect, useState } from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { Clock3 } from "reicon-react/icons/Clock3";
import { Menu4 } from "reicon-react/icons/Menu4";
import { X } from "reicon-react/icons/X";
import { motion } from "framer-motion";
import { IconGlyph } from "../ui/IconGlyph";
import { describeHealth } from "../../lib/serverStatus";
import { navMap } from "./navigationConfig";

export function TopNav({ active, scenarioTitle, sessionMode, aiHealth, menuOpen, onMenuOpen, onNavigate, scenarios = [], onScenarioSelect }) {
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

  return (
    <header className="top-nav glass-panel">
      <button className="brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark" aria-hidden="true">M</span><span>Mirrorting</span>
      </button>
      <nav aria-label="주요 화면">
        {Object.entries(navMap).map(([label, target]) => <button key={label} className={active === target ? "active" : ""} type="button" onClick={() => onNavigate(target)}>{label}</button>)}
      </nav>
      <div className="nav-actions">
        {active === "practice" && (
          <div className="nav-dropdown-wrapper">
            <button className="scenario-select" type="button" onClick={toggleScenario}>{scenarioTitle || "역할극"} <ChevronDown size={16} /></button>
            {scenarioOpen && scenarios.length > 0 && <div className="nav-dropdown scenario-dropdown glass-panel" onClick={(event) => event.stopPropagation()}><h3>시나리오 전환</h3><ul>{scenarios.map((scenario) => <li key={scenario.slug} onClick={() => { onScenarioSelect(scenario.slug); setScenarioOpen(false); }} className={scenario.title === scenarioTitle ? "active" : ""}>{scenario.title}</li>)}</ul></div>}
          </div>
        )}
        <ServerStatusPill aiHealth={aiHealth} />
        <span className="timer-pill"><Clock3 size={17} /> {sessionMode ? `${sessionMode}분 모드` : "연습 준비"}</span>
        <button className="mobile-menu-button" type="button" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => onMenuOpen(true)}><Menu4 size={22} /></button>
      </div>
    </header>
  );
}

export function MobileMenuSheet({ open, active, onClose, onNavigate }) {
  return (
    <motion.div className={`mobile-menu-layer ${open ? "open" : ""}`} aria-hidden={!open} initial={false} animate={open ? "open" : "closed"} variants={{ open: { opacity: 1, pointerEvents: "auto" }, closed: { opacity: 0, pointerEvents: "none" } }}>
      <button className="mobile-menu-backdrop" type="button" aria-label="메뉴 닫기" onClick={onClose} />
      <motion.section className="mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="모바일 메뉴" variants={{ open: { y: 0 }, closed: { y: 28 } }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
        <div className="sheet-handle" />
        <div className="sheet-head"><strong>Mirrorting</strong><button type="button" aria-label="메뉴 닫기" onClick={onClose}><X size={20} /></button></div>
        <nav aria-label="모바일 주요 화면">{Object.entries(navMap).map(([label, target]) => <button key={label} className={active === target ? "active" : ""} type="button" onClick={() => onNavigate(target)}><IconGlyph icon={target === "role" ? "roleplay" : target === "result" ? "report" : target === "compare" ? "retry" : "coach"} size={23} /><span>{label}</span><ArrowRight size={17} /></button>)}</nav>
      </motion.section>
    </motion.div>
  );
}

// 분석 서버 연결 상태 칩 — 운영자가 어느 화면에서든 백엔드 상태를 바로 확인할 수 있어요.
function ServerStatusPill({ aiHealth }) {
  const status = describeHealth(aiHealth);
  return (
    <span className={`server-status-pill ${status.tone}`} role="status" title={status.detail}>
      <i aria-hidden="true" />
      {status.label}
    </span>
  );
}
