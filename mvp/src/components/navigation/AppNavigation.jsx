import { useEffect, useState } from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Bell } from "reicon-react/icons/Bell";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { Clock3 } from "reicon-react/icons/Clock3";
import { Menu4 } from "reicon-react/icons/Menu4";
import { X } from "reicon-react/icons/X";
import { motion } from "framer-motion";
import { IconGlyph } from "../ui/IconGlyph";
import { navMap } from "./navigationConfig";

export function TopNav({ active, scenarioTitle, sessionMode, menuOpen, onMenuOpen, onNavigate, scenarios = [], onScenarioSelect }) {
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);

  useEffect(() => {
    const handleOutsideClick = () => {
      setBellOpen(false);
      setProfileOpen(false);
      setScenarioOpen(false);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const toggleBell = (event) => {
    event.stopPropagation();
    setBellOpen(!bellOpen);
    setProfileOpen(false);
    setScenarioOpen(false);
  };

  const toggleProfile = (event) => {
    event.stopPropagation();
    setProfileOpen(!profileOpen);
    setBellOpen(false);
    setScenarioOpen(false);
  };

  const toggleScenario = (event) => {
    event.stopPropagation();
    setScenarioOpen(!scenarioOpen);
    setBellOpen(false);
    setProfileOpen(false);
  };

  return (
    <header className="top-nav glass-panel">
      <button className="brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark" aria-hidden="true"><img src="/icons/app-icon-192.png" alt="" /></span><span>Mirror-Ting</span>
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
        <span className="timer-pill"><Clock3 size={17} /> {sessionMode ? `${sessionMode}분 모드` : "연습 준비"}</span>
        <span className="divider" />
        <div className="nav-dropdown-wrapper">
          <button className={`bell-button ${bellOpen ? "active" : ""}`} type="button" aria-label="알림" onClick={toggleBell}><Bell size={20} /><b>3</b></button>
          {bellOpen && <div className="nav-dropdown bell-dropdown glass-panel" onClick={(event) => event.stopPropagation()}><h3>최신 알림</h3><ul><li onClick={() => { onNavigate("compare"); setBellOpen(false); }}><strong>[기록 비교]</strong> 첫 출근 연습 기록의 성장 추이를 확인해 보세요.</li><li onClick={() => { onNavigate("feedback"); setBellOpen(false); }}><strong>[코칭 안내]</strong> 새로운 난이도 [압박 질문]에 대한 대응 팁이 추가되었습니다.</li><li onClick={() => { onNavigate("result"); setBellOpen(false); }}><strong>[분석 완료]</strong> ㈜클라우드밋 신입 백엔드 개발자 시뮬레이션 분석 완료!</li></ul></div>}
        </div>
        <div className="nav-dropdown-wrapper">
          <button className={`profile-button ${profileOpen ? "active" : ""}`} type="button" onClick={toggleProfile}><Avatar size="sm" /><strong>체험자</strong><ChevronDown size={16} /></button>
          {profileOpen && <div className="nav-dropdown profile-dropdown glass-panel" onClick={(event) => event.stopPropagation()}><div className="user-info"><strong>체험자님</strong><span>mirror-ting-user@kiosk</span></div><hr /><ul><li onClick={() => { onNavigate("compare"); setProfileOpen(false); }}>나의 기록 비교</li><li onClick={() => { onNavigate("setup"); setProfileOpen(false); }}>새 연습 시작</li><li onClick={() => { window.location.href = "/admin"; setProfileOpen(false); }}>운영 대시보드</li></ul></div>}
        </div>
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
        <div className="sheet-head"><strong>Mirror-Ting</strong><button type="button" aria-label="메뉴 닫기" onClick={onClose}><X size={20} /></button></div>
        <nav aria-label="모바일 주요 화면">{Object.entries(navMap).map(([label, target]) => <button key={label} className={active === target ? "active" : ""} type="button" onClick={() => onNavigate(target)}><IconGlyph icon={target === "role" ? "roleplay" : target === "result" ? "report" : target === "compare" ? "retry" : "coach"} size={23} /><span>{label}</span><ArrowRight size={17} /></button>)}</nav>
      </motion.section>
    </motion.div>
  );
}

function Avatar({ size = "md" }) {
  return <span className={`avatar profile-avatar ${size} blue`} aria-hidden="true">M</span>;
}
