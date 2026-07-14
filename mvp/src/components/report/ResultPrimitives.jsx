import { ArrowLeft } from "reicon-react/icons/ArrowLeft";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Check } from "reicon-react/icons/Check";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { Clock3 } from "reicon-react/icons/Clock3";
import { DocumentText2 } from "reicon-react/icons/DocumentText2";
import { useState } from "react";
import { InfoCircle } from "reicon-react/icons/InfoCircle";
import { IconGlyph } from "../ui/IconGlyph";

export function PageTitle({ eyebrow, title, subtitle }) {
  return <div className="page-title">{eyebrow && <p>{eyebrow}</p>}<h1>{title}</h1>{subtitle && <h2>{subtitle}</h2>}</div>;
}

export function PageToolbar({ onPrev, leftLabel = "이전 단계", rightLabel }) {
  return <div className="page-toolbar"><button className="ghost-pill" type="button" onClick={onPrev}><ArrowLeft size={18} /> {leftLabel}</button>{rightLabel && <span className="ghost-pill"><InfoCircle size={17} /> {rightLabel}</span>}</div>;
}

export function Panel({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function ScoreRing({ value, label, size = "lg" }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (value / 100) * circumference;
  return <div className={`score-ring ${size}`} style={{ "--progress": progress, "--circumference": circumference }}><svg viewBox="0 0 132 132" aria-hidden="true"><circle className="track" cx="66" cy="66" r={radius} /><circle className="fill" cx="66" cy="66" r={radius} strokeDasharray={circumference} strokeDashoffset={progress} /></svg><strong>{value}</strong><span>/100</span>{label && <em>{label}</em>}</div>;
}

export function MetricBar({ label, value, icon, tone, suffix = "/100" }) {
  return <div className="metric-bar"><span className={`choice-icon ${tone}`}><IconGlyph icon={icon} size={23} /></span><div><div><strong>{label}</strong><b>{suffix === "/100" ? value : "—"}<small>{suffix}</small></b></div><i><span style={{ width: `${value}%` }} /></i></div></div>;
}

export function FeedbackBox({ tone, title, items }) {
  return <div className={`feedback-box ${tone}`}><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

export function InfoRow({ icon, label, value }) {
  return <div className="info-row"><IconGlyph icon={icon} size={19} /><span>{label}</span><strong>{value}</strong></div>;
}

export function SecondaryButton({ icon, label, onClick }) {
  return <button className="secondary-button" type="button" onClick={onClick}><IconGlyph icon={icon} size={22} />{label}</button>;
}

export function PrimaryButton({ icon, label, onClick, wide = false, leadingIcon = true }) {
  return <button className={`primary-button ${wide ? "wide" : ""}`} type="button" onClick={onClick}>{leadingIcon && <IconGlyph icon={icon} size={22} />}{label}<ArrowRight size={21} /></button>;
}

export function Chip({ children, tone = "blue" }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function DisclosurePanel({ title, icon, defaultOpen = true, children, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`card disclosure-panel ${className} ${open ? "open" : "closed"}`}><button className="disclosure-head" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span><IconGlyph icon={icon} size={20} /> {title}</span><ChevronDown size={18} /></button>{open && <div className="disclosure-body">{children}</div>}</section>;
}

export function SegmentedTabs({ values, active, onChange }) {
  return <div className="segmented-tabs">{values.map((value) => <button className={value === active ? "active" : ""} type="button" key={value} onClick={() => onChange?.(value)}>{value}</button>)}</div>;
}

export function InsightStep({ icon, title, text }) {
  return <div className="insight-step"><span><IconGlyph icon={icon} size={21} /></span><h3>{title}</h3><p>{text}</p></div>;
}

export function MiniScoreRow({ fit }) {
  return <div className={`mini-score-row ${fit.color}`}><IconGlyph icon={fit.icon} size={22} /><strong>{fit.key}</strong><i><span style={{ width: `${fit.measured === false ? 0 : fit.score}%` }} /></i><b>{fit.measured === false ? "—" : fit.score}<small>{fit.measured === false ? "측정 제외" : "/100"}</small></b></div>;
}

export function FitColumn({ fit, compact = false }) {
  return <div className={`fit-column ${fit.color} ${compact ? "compact" : ""}`}><IconGlyph icon={fit.icon} size={compact ? 20 : 24} /><strong>{fit.measured === false ? "—" : fit.score}</strong><small>{fit.measured === false ? "측정 제외" : "/100"}</small><span>{fit.label}</span>{!compact && <Chip tone={fit.color}>{fit.grade}</Chip>}</div>;
}

export function ExportCard({ icon, title, text, tone = "blue", onClick }) {
  return <button className="export-card" type="button" onClick={onClick}><span className={`choice-icon ${tone}`}><IconGlyph icon={icon} size={24} /></span><strong>{title}</strong><p>{text}</p><i><ArrowRight size={19} /></i></button>;
}

export function AttemptCard({ title, date, score, text, selected = false, color }) {
  return <Panel className={`attempt-card ${selected ? "selected" : ""} ${color}`}><div><h2>{title}</h2>{selected && <Chip>BEST</Chip>}<span>{date}</span></div><ScoreRing value={score} size="md" /><div><h3>{text}</h3><p>같은 상황을 다시 연습하면 세부 변화를 비교할 수 있어요.</p><div className="attempt-meta"><Chip><Clock3 size={15} /> 연습 완료 기록</Chip><Chip><DocumentText2 size={15} /> 분석 리포트</Chip></div></div>{selected && <span className="corner-check"><Check size={33} /></span>}</Panel>;
}

export function ProgressMini({ value, color = "blue" }) {
  return <i className={`progress-mini ${color}`}><span style={{ width: `${value}%` }} /></i>;
}

export function CompareRow({ label, text, before, after, icon }) {
  const delta = after - before;
  return <div className="compare-row"><span className="choice-icon blue"><IconGlyph icon={icon} size={24} /></span><div><strong>{label}</strong><small>{text}</small></div><ProgressMini value={before} color="sky" /><b>{before}<small>/100</small></b><ArrowRight size={18} /><ProgressMini value={after} /><b>{after}<small>/100</small></b><em>{delta > 0 ? "+" : ""}{delta} {delta >= 0 ? "↑" : "↓"}</em></div>;
}

export function ImprovedPoint({ icon, title, text }) {
  return <div className="improved-point"><span className="choice-icon sky"><IconGlyph icon={icon} size={24} /></span><p><strong>{title}</strong>{text}</p></div>;
}

export function HistoryPoint({ label, score, date, active = false }) {
  const order = label.match(/\d+/)?.[0] || (active ? "2" : "1");
  return <div className={`history-point ${active ? "active" : ""}`}><span>{order}</span><strong>{label}</strong><b>{score}</b>{date && <small>{date}</small>}</div>;
}

export const Info = InfoCircle;
