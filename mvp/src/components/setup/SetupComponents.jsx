import React from "react";
import { Check } from "reicon-react/icons/Check";
import { Clock3 } from "reicon-react/icons/Clock3";
import { Bulb2 } from "reicon-react/icons/Bulb2";
import { ShieldCheck } from "reicon-react/icons/ShieldCheck";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { motion } from "framer-motion";
import { IconGlyph } from "../ui/IconGlyph";

export function PageTitle({ eyebrow, title, subtitle }) {
  return (
    <div className="page-title">
      {eyebrow && <p>{eyebrow}</p>}
      <h1>{title}</h1>
      {subtitle && <h2>{subtitle}</h2>}
    </div>
  );
}

export function SetupMotionPage({ children }) {
  return (
    <motion.section
      className="page selection-page setup-flow-page"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}

export function Panel({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function PrimaryBar({ label, onClick, className = "", disabled = false }) {
  return (
    <button className={`primary-bar ${className}`} type="button" onClick={onClick} disabled={disabled}>
      {label}
      <ArrowRight size={24} />
    </button>
  );
}

export function SetupFlowActions({ onPrev, label, onNext, nextDisabled = false }) {
  return (
    <div className="setup-flow-actions">
      <button className="setup-back-button" type="button" onClick={onPrev}>이전</button>
      <PrimaryBar className="setup-next-button" label={label} onClick={onNext} disabled={nextDisabled} />
    </div>
  );
}

export function MiniStepper({ items, active }) {
  return (
    <div className="mini-stepper">
      <strong>Step {active + 1} / {items.length}</strong>
      <div className="mini-step-track">
        {items.map(([num, label], index) => (
          <React.Fragment key={label}>
            <span className={index === active ? "active" : ""}><b>{num}</b>{label}</span>
            {index < items.length - 1 && <i />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function ChoiceSection({ icon, image, title, description, children, columns = "three", className = "" }) {
  return (
    <section className={`choice-section ${className}`}>
      <div className="choice-section-heading">
        {(image || icon) && <span className="choice-section-icon">{image ? <img className="selection-section-asset" src={image} alt="" aria-hidden="true" width="256" height="256" /> : <IconGlyph icon={icon} size={24} />}</span>}
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className={`choice-grid ${columns}`}>{children}</div>
    </section>
  );
}

export function ChoiceCard({ icon, image, title, text, detail, badge, selected = false, compact = false, tone = "blue", variant = "default", onClick }) {
  return (
    <button
      className={`choice-card ${variant} ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
    >
      {image ? <img className="choice-asset" src={image} alt="" aria-hidden="true" width="256" height="256" loading="lazy" decoding="async" /> : <span className={`choice-icon ${tone}`}><IconGlyph icon={icon} size={36} /></span>}
      <span className="choice-copy">
        <strong>{title}{badge && <i className={`choice-badge ${tone}`}>{badge}</i>}</strong>
        <small>{text}</small>
        {detail && <em>{detail}</em>}
      </span>
      {selected && <b><Check size={16} /></b>}
    </button>
  );
}

function SummaryItem({ icon, image, label, value, tone = "blue" }) {
  return (
    <div className="summary-item">
      {image ? <img className="summary-asset" src={image} alt="" aria-hidden="true" width="256" height="256" /> : <span className={`choice-icon ${tone}`}><IconGlyph icon={icon} size={28} /></span>}
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SummaryPanel({ children, className = "" }) {
  return <section className={`summary-panel card ${className}`} aria-label="선택 요약">{children}</section>;
}

export function SetupSelectionSummary({ counterpart, scenario, scenarioImage, difficulty, modeLabel, tip }) {
  return (
    <SummaryPanel className="setup-summary-panel">
      <h2><Sparkles size={21} /> 선택 요약</h2>
      <p>현재 선택한 설정을 확인해요.</p>
      <SummaryItem image={counterpart.image} label="상대 역할" value={counterpart.title} tone="blue" />
      <SummaryItem image={scenarioImage} icon="briefcase" label="연습 상황" value={scenario?.title?.replace(" — ", " —\n") || "다음 단계에서 선택"} tone="blue" />
      <SummaryItem image={difficulty?.image} icon="normal" label="난이도" value={difficulty?.title || "다음 단계에서 선택"} tone={difficulty?.tone || "blue"} />
      <div className="time-box setup-summary-time">
        <Clock3 size={20} />
        <div><span>예상 소요 시간</span><strong>{modeLabel}</strong></div>
      </div>
      <div className="tip-box setup-summary-tip">
        <Bulb2 size={22} />
        <div>
          <strong>팁</strong>
          <p>{tip}</p>
        </div>
      </div>
      <p className="setup-summary-note"><ShieldCheck size={17} /> 설정은 연습을 시작하기 전까지 바꿀 수 있어요.</p>
    </SummaryPanel>
  );
}
