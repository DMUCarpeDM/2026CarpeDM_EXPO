import { ScrollHighlight } from "./OriginHomeEffects";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ChatDots } from "reicon-react/icons/ChatDots";
import { Mic } from "reicon-react/icons/Mic";
import { Presentation } from "reicon-react/icons/Presentation";

import { UserScan } from "reicon-react/icons/UserScan";
import { Button } from "../ui/shadcn";

export const fitMetrics = [
  { icon: ChatDots, label: "응답", value: 82, detail: "핵심부터 말했어요" },
  { icon: Mic, label: "목소리", value: 76, detail: "속도가 안정적이에요" },
  { icon: UserScan, label: "표정", value: 84, detail: "상황에 맞게 반응했어요" },
  { icon: Presentation, label: "자세", value: 71, detail: "어깨를 조금 펴보세요" },
];

export function ContextVisual({ image, alt, title, text, align = "left" }) {
  return (
    <section className={`mode-context-visual mode-context-visual--${align}`}>
      <img src={image} alt={alt} />
      <div className="mode-context-visual__copy">
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

export function SectionIntro({ eyebrow, title, text, align = "left", highlight = false, showEyebrow = false }) {
  return <div className={`section-intro section-intro--${align}`}>{showEyebrow && <span>{eyebrow}</span>}<h2>{title}</h2>{text && (highlight ? <ScrollHighlight text={text} /> : <p>{text}</p>)}</div>;
}

export function ProcessCard({ icon: Icon, number, title, text, compact = false }) {
  return <article className={`process-card ${compact ? "process-card--compact" : ""}`}><span>{number}</span><i className="mode-icon"><Icon size={21} /></i><h3>{title}</h3><p>{text}</p></article>;
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
