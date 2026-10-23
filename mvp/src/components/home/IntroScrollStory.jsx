import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ChatDots } from "reicon-react/icons/ChatDots";
import "../../styles/intro-scroll-story.css";

const steps = [
  { label: "상황 설정" },
  { label: "대화 연습" },
  { label: "피드백" },
];

export function IntroScrollStory({ mode, example, background }) {
  const [active, setActive] = useState(1);
  const track = useRef(null);
  const phase = useRef(-1);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const compact = matchMedia("(max-height: 720px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!track.current || motion.matches || compact.matches) return;
      const node = track.current;
      const stage = node.firstElementChild;
      const inset = parseFloat(getComputedStyle(stage).top) || 0;
      const distance = node.offsetHeight - stage.offsetHeight;
      const progress = (inset - node.getBoundingClientRect().top) / Math.max(1, distance);
      // Show the conversation preview before the scroll walkthrough begins.
      const next = progress <= 0 ? -1 : Math.min(2, Math.floor(progress * 3));
      if (next !== phase.current) {
        phase.current = next;
        setActive(next < 0 ? 1 : next);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    compact.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      compact.removeEventListener("change", schedule);
    };
  }, []);
  const select = index => {
    const node = track.current;
    if (!matchMedia("(prefers-reduced-motion: reduce), (max-height: 720px)").matches) {
      const stage = node.firstElementChild;
      const inset = parseFloat(getComputedStyle(stage).top) || 0;
      const distance = node.offsetHeight - stage.offsetHeight;
      window.scrollTo({ top: node.getBoundingClientRect().top + scrollY - inset + distance * (index + .5) / 3, behavior: "instant" });
    }
    setActive(index);
  };
  return <section className="intro-story" id={`${mode}-overview`} aria-labelledby={`${mode}-intro-title`}>
    <div className="intro-story-track" ref={track} id={`${mode}-practice-preview`}>
      <div className="intro-story-stage" data-step={active}>
        {background}
    <header className="intro-story-heading">
      <span className="intro-story-label">AI 대화 연습 · Mirror-Ting</span>
      <h2 id={`${mode}-intro-title`}>중요한 대화 전에,<br />나의 말과 태도를 연습하세요.</h2>
    </header>

        <div className="intro-story-tabs" role="group" aria-label="연습 과정 살펴보기">{steps.map((step, index) => <button key={step.label} type="button" aria-pressed={active === index} aria-controls={`${mode}-story-example`} onClick={() => select(index)}><span>0{index + 1}</span>{step.label}</button>)}</div>
        <div className="intro-story-example" id={`${mode}-story-example`}>
          <div className="intro-story-bar"><span><ChatDots size={16} aria-hidden="true" />{example.setting}</span></div>
          <div className="intro-story-scene" key={active}>
            {active === 0 && <><span className="intro-story-label">어떤 대화를 연습할까요?</span><p className="intro-story-main">{example.prompt}</p><div className="intro-story-chips"><span>상황</span><span>상대</span><span>원하는 목표</span></div><div className="intro-story-input" aria-hidden="true">연습할 상황을 자유롭게 적어보세요 <ArrowRight size={18} /></div></>}
            {active === 1 && <><span className="intro-story-label">AI · {example.persona}</span><p className="intro-story-main">{example.question}</p><div className="intro-story-answer"><small>나의 답변</small><p>{example.answer}</p></div><div className="intro-story-input" aria-hidden="true">나의 말로 답해보세요 <ArrowRight size={18} /></div></>}
            {active === 2 && <><span className="intro-story-label">대화 피드백</span><p className="intro-story-main">{example.feedback}</p><div className="intro-story-answer"><small>다시 말해볼 때</small><p>{example.detail}</p></div></>}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
