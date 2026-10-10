import { ArrowLeft } from "reicon-react/icons/ArrowLeft";
import { InfoCircle } from "reicon-react/icons/InfoCircle";

export function PageToolbar({ onPrev, leftLabel = "이전 단계", rightLabel }) {
  return <div className="page-toolbar"><button className="ghost-pill" type="button" onClick={onPrev}><ArrowLeft size={18} /> {leftLabel}</button>{rightLabel && <span className="ghost-pill"><InfoCircle size={17} /> {rightLabel}</span>}</div>;
}

export function ScoreRing({ value, label, size = "lg" }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - ((value ?? 0) / 100) * circumference;
  return <div className={`score-ring ${size}`} style={{ "--progress": progress, "--circumference": circumference }}><svg viewBox="0 0 132 132" aria-hidden="true"><circle className="track" cx="66" cy="66" r={radius} /><circle className="fill" cx="66" cy="66" r={radius} strokeDasharray={circumference} strokeDashoffset={progress} /></svg><strong>{value ?? "—"}</strong><span>{value == null ? "미측정" : "/100"}</span>{label && <em>{label}</em>}</div>;
}
