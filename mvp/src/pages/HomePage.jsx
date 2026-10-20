import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "reicon-react/icons/ArrowUp";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { serviceModes } from "../data/setupCatalog";
import { HomeMotion, HomeFooter } from "../components/home/HomeMotion";
import { InterviewHome } from "../components/home/InterviewHome";
import { WorkplaceHome } from "../components/home/WorkplaceHome";
import { resolveServiceHomeContent } from "../data/serviceHomeContent";
import "../styles/home-motion.css";
import "../styles/prompt-home.css";

const heroWords = ["면접", "출근", "회식", "미팅", "회의"];

function HeroTypingWord() {
  const [text, setText] = useState(heroWords[0]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;
    let index = 0;
    let count = heroWords[0].length;
    let erasing = true;
    const tick = () => {
      count += erasing ? -1 : 1;
      setText(heroWords[index].slice(0, count));
      let delay = erasing ? 85 : 150;
      if (count === 0) {
        index = (index + 1) % heroWords.length;
        erasing = false;
        delay = 260;
      } else if (count === heroWords[index].length) {
        erasing = true;
        delay = 1600;
      }
      timer = window.setTimeout(tick, delay);
    };
    const restart = () => {
      window.clearTimeout(timer);
      index = 0; count = heroWords[0].length; erasing = true;
      setText(heroWords[0]);
      if (!reduced.matches) timer = window.setTimeout(tick, 1600);
    };
    restart();
    reduced.addEventListener("change", restart);
    return () => { window.clearTimeout(timer); reduced.removeEventListener("change", restart); };
  }, []);
  return <span className="hero-typing-word">{text}</span>;
}

function ModeDropdown({ mode, onModePick, id }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const trigger = useRef(null);
  const selected = serviceModes.findIndex(item => item.id === mode.id);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const pick = index => { onModePick(serviceModes[index].id); setOpen(false); trigger.current?.focus(); };
  return (
    <div className="prompt-mode-dropdown" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={trigger} type="button" className="prompt-mode-trigger" role="combobox" aria-label="연습 종류" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-modes`} aria-activedescendant={open ? `${id}-mode-${active}` : undefined} onClick={() => { setActive(selected); setOpen(!open); }} onKeyDown={event => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          setActive(event.key === "Home" ? 0 : event.key === "End" ? serviceModes.length - 1 : !open ? selected : (active + (event.key === "ArrowDown" ? 1 : -1) + serviceModes.length) % serviceModes.length);
          setOpen(true);
        } else if ((event.key === "Enter" || event.key === " ") && open) { event.preventDefault(); pick(active); }
        else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        else if (event.key === "Tab") setOpen(false);
      }}>{serviceModes[selected]?.label}<ChevronDown size={12} aria-hidden="true" /></button>
      {open && <div className="prompt-mode-menu" id={`${id}-modes`} role="listbox" aria-label="연습 종류 선택">{serviceModes.map((item, index) => <div key={item.id} id={`${id}-mode-${index}`} role="option" aria-selected={item.id === mode.id} className={active === index ? "is-active" : ""} onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => pick(index)}><span>{item.label}</span><span aria-hidden="true">{item.id === mode.id ? "✓" : ""}</span></div>)}</div>}
    </div>
  );
}

function PromptComposer({ mode, prompt, onPrompt, onNext, onModePick, id, inputRef }) {
  const [notice, setNotice] = useState("");
  return (
          <form className="prompt-home-composer" onSubmit={event => {
            event.preventDefault();
            if (onNext) onNext();
            else setNotice("새로운 연습 화면을 준비하고 있어요.");
          }}>
            <label className="screen-reader-note" htmlFor={id}>연습하고 싶은 상황</label>
            <textarea ref={inputRef} id={id} value={prompt} onChange={event => { onPrompt(event.target.value); setNotice(""); }} rows={2} placeholder={mode.id === "interview" ? "예: 신입 개발자 면접에서 프로젝트 경험을 설명하고 추가 질문에 답하고 싶어요." : "예: 팀장에게 일정이 늦어진 이유를 설명하고 먼저 할 일을 정하고 싶어요."} />
            <div className="prompt-home-toolbar"><ModeDropdown mode={mode} onModePick={onModePick} id={id} /><button type="submit" aria-label={onNext ? "입력한 상황으로 연습 준비하기" : "입력한 상황 확인하기"}><ArrowUp size={18} aria-hidden="true" /></button></div>
            {notice && <p className="prompt-home-description" role="status">{notice}</p>}
          </form>
  );
}

export function HomePage({ serviceMode, prompt = "", onPrompt, onNext, onModeSelect, onModePick }) {
  const mode = resolveServiceHomeContent(serviceMode?.id);
  const input = useRef(null);
  const composerProps = { mode, prompt, onPrompt, onNext, onModePick };
  const footerComposer = <PromptComposer {...composerProps} id="footer-scenario-prompt" />;
  const focusPrompt = () => {
    input.current?.scrollIntoView({ behavior: "auto", block: "center" });
    input.current?.focus({ preventScroll: true });
  };

  return (
    <section className={`page home-page mode-home-page mode-home-page--${mode.id}`}>
      <section className="prompt-home-hero" aria-labelledby="prompt-home-title">
        <div className="prompt-home-inner">
          <h1 id="prompt-home-title"><span className="screen-reader-note">첫 면접, 출근, 회식, 미팅, 회의 전에 먼저 연습해요.</span><span aria-hidden="true">첫 <HeroTypingWord />전에,<br />먼저 연습해요.</span></h1>
          <p className="prompt-home-description">연습할 상황을 적어보세요.<br className="prompt-mobile-break" /> AI가 대화 상대가 돼요.</p>
          <PromptComposer {...composerProps} id="home-scenario-prompt" inputRef={input} />
        </div>
      </section>
      <HomeMotion key={mode.id}>
        {mode.id === "interview" && <InterviewHome onNext={focusPrompt} composer={footerComposer} />}
        {mode.id === "workplace" && <WorkplaceHome onNext={focusPrompt} composer={footerComposer} />}
      </HomeMotion>
      <HomeFooter mode={mode.id} onNext={focusPrompt} onModeSelect={onModeSelect} />
    </section>
  );
}
