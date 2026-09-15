import { ScrollHighlight } from "./OriginHomeEffects";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ChatDots } from "reicon-react/icons/ChatDots";
import { Mic } from "reicon-react/icons/Mic";
import { Presentation } from "reicon-react/icons/Presentation";
import { ShieldCheck } from "reicon-react/icons/ShieldCheck";
import { UserScan } from "reicon-react/icons/UserScan";
import { Button, Card, CardContent, Progress } from "../ui/shadcn";

export const fitMetrics = [
  { icon: ChatDots, label: "응답", value: 82, detail: "핵심부터 말했어요" },
  { icon: Mic, label: "목소리", value: 76, detail: "속도가 안정적이에요" },
  { icon: UserScan, label: "표정", value: 84, detail: "상황에 맞게 반응했어요" },
  { icon: Presentation, label: "자세", value: 71, detail: "어깨를 조금 펴보세요" },
];

export function EvidenceStrip({ items }) {
  return (
    <section className="mode-evidence-strip" aria-label="서비스 강점 요약">
      {items.map(([value, label]) => (
        <div key={label}><strong>{value}</strong><span>{label}</span></div>
      ))}
    </section>
  );
}

export function ContextVisual({ image, alt, eyebrow, title, text, align = "left" }) {
  return (
    <section className={`mode-context-visual mode-context-visual--${align}`}>
      <img src={image} alt={alt} />
      <div className="mode-context-visual__copy">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

export function SectionIntro({ eyebrow, title, text, align = "left", highlight = false }) {
  return <div className={`section-intro section-intro--${align}`}><span>{eyebrow}</span><h2>{title}</h2>{text && (highlight ? <ScrollHighlight text={text} /> : <p>{text}</p>)}</div>;
}

export function ProcessCard({ icon: Icon, number, title, text, compact = false }) {
  return <article className={`process-card ${compact ? "process-card--compact" : ""}`}><span>{number}</span><i className="mode-icon"><Icon size={21} /></i><h3>{title}</h3><p>{text}</p></article>;
}

export function FitMetric({ icon: Icon, label, value, detail }) {
  return <Card className="fit-metric"><CardContent><div className="fit-metric__head"><span className="mode-icon"><Icon size={19} /></span><b>{label}</b><strong>{value}</strong></div><Progress value={value} /><p>{detail}</p></CardContent></Card>;
}

export function TrustLine() {
  return <div className="mode-trust-line"><ShieldCheck size={16} /><span>영상과 음성은 기기 안에서 분석해요</span></div>;
}

export function FooterCta({ title, text, button, onNext }) {
  return (
    <section className="mode-footer-cta">
      <div><h2>{title}</h2><p>{text}</p></div>
      <Button size="lg" type="button" onClick={onNext}>{button} <ArrowRight size={18} /></Button>
    </section>
  );
}

export function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
