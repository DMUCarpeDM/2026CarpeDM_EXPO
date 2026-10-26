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

function PromptDropdown({ options, value, onChange, label, id }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const trigger = useRef(null);
  const selected = options.findIndex(item => item.id === value);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const pick = index => { onChange(options[index].id); setOpen(false); trigger.current?.focus(); };
  return (
    <div className="prompt-mode-dropdown" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={trigger} type="button" className="prompt-mode-trigger" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-modes`} aria-activedescendant={open ? `${id}-mode-${active}` : undefined} onClick={() => { setActive(selected); setOpen(!open); }} onKeyDown={event => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          setActive(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : !open ? selected : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          setOpen(true);
        } else if ((event.key === "Enter" || event.key === " ") && open) { event.preventDefault(); pick(active); }
        else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        else if (event.key === "Tab") setOpen(false);
      }}>{options[selected]?.label}<ChevronDown size={12} aria-hidden="true" /></button>
      {open && <div className="prompt-mode-menu" id={`${id}-modes`} role="listbox" aria-label={`${label} 선택`}>{options.map((item, index) => <div key={item.id} id={`${id}-mode-${index}`} role="option" aria-selected={item.id === value} className={active === index ? "is-active" : ""} onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => pick(index)}><span>{item.label}</span><span aria-hidden="true">{item.id === value ? "✓" : ""}</span></div>)}</div>}
    </div>
  );
}

const turnOptions = [{ id: 5, label: "5턴" }, { id: 10, label: "10턴" }];

function PromptComposer({ mode, prompt, onPrompt, onNext, onModePick, turns, onTurns, id, inputRef }) {
  const [notice, setNotice] = useState("");
  return (
          <form className="prompt-home-composer" onSubmit={event => {
            event.preventDefault();
            if (onNext) onNext();
            else setNotice("새로운 연습 화면을 준비하고 있어요.");
          }}>
            <label className="screen-reader-note" htmlFor={id}>연습하고 싶은 상황</label>
            <textarea ref={inputRef} id={id} value={prompt} onChange={event => { onPrompt(event.target.value); setNotice(""); }} rows={2} placeholder={mode.id === "interview" ? "예: 신입 개발자 면접에서 프로젝트 경험을 설명하고 추가 질문에 답하고 싶어요." : "예: 팀장에게 일정이 늦어진 이유를 설명하고 먼저 할 일을 정하고 싶어요."} />
            <div className="prompt-home-toolbar"><PromptDropdown options={turnOptions} value={turns} onChange={onTurns} label="연습 턴 수" id={`${id}-turns`} /><PromptDropdown options={serviceModes} value={mode.id} onChange={onModePick} label="연습 종류" id={id} /><button type="submit" aria-label={onNext ? "입력한 상황으로 연습 준비하기" : "입력한 상황 확인하기"}><ArrowUp size={18} aria-hidden="true" /></button></div>
            {notice && <p className="prompt-home-description" role="status">{notice}</p>}
          </form>
  );
}

export function HomePage({ serviceMode, prompt = "", onPrompt, onNext, onModeSelect, onModePick, turns = 5, onTurns, dashboard = false, history = [], onRecords }) {
  const mode = resolveServiceHomeContent(serviceMode?.id);
  const input = useRef(null);
  const [projectTab, setProjectTab] = useState("내 연습");
  useEffect(() => { if (dashboard) window.scrollTo(0, 0); }, [dashboard]);
  const composerProps = { mode, prompt, onPrompt, onNext, onModePick, turns, onTurns };
  const footerComposer = <PromptComposer {...composerProps} id="footer-scenario-prompt" />;
  const focusPrompt = () => {
    input.current?.scrollIntoView({ behavior: "auto", block: "center" });
    input.current?.focus({ preventScroll: true });
  };

  return (
    <section className={`page home-page mode-home-page mode-home-page--${mode.id} ${dashboard ? "lovable-dashboard" : ""}`}>
      <section className="prompt-home-hero" aria-labelledby="prompt-home-title">
        {dashboard && <button className="dashboard-announcement" type="button" onClick={() => { if (!prompt.trim()) onPrompt("어떤 대화를 연습하면 좋을지 함께 정하고 싶어요."); onNext(); }}>✦ AI와 함께 대화를 준비해요 <span aria-hidden="true">→</span></button>}
        <div className="prompt-home-inner">
          <h1 id="prompt-home-title"><span className="screen-reader-note">첫 면접, 출근, 회식, 미팅, 회의 전에 먼저 연습해요.</span><span aria-hidden="true">첫 <HeroTypingWord />전에,<br />먼저 연습해요.</span></h1>
          <p className="prompt-home-description">연습할 상황을 적어보세요.<br className="prompt-mobile-break" /> AI가 대화 상대가 돼요.</p>
          <PromptComposer {...composerProps} id="home-scenario-prompt" inputRef={input} />
        </div>
      </section>
      {dashboard && <section className="member-recent dashboard-projects" aria-labelledby="member-recent-title">
        <header><div className="dashboard-project-tabs" role="group" aria-label="연습 목록">{["내 연습", "최근 연습", "연습 템플릿"].map(tab => <button type="button" key={tab} aria-pressed={projectTab === tab} onClick={() => setProjectTab(tab)}>{tab}</button>)}</div><button type="button" onClick={onRecords}>전체 둘러보기 →</button></header>
        <h2 id="member-recent-title" className="screen-reader-note">{projectTab}</h2>
        <div className="member-recent-grid">{projectTab === "연습 템플릿" ? ["첫 면접에서 자기소개하기", "팀장과 업무 일정 조율하기", "처음 만난 동료와 대화하기"].map((title,index) => <button className="dashboard-template" type="button" key={title} onClick={() => { onPrompt(title); focusPrompt(); }}><div className={`dashboard-project-cover cover-${index}`} aria-hidden="true">{["면접", "미팅", "대화"][index]}</div><h3>{title}</h3><p>이 상황으로 연습 준비하기 →</p></button>) : history.length ? history.slice(-4).reverse().map((item,index)=><article key={item.session_id || item.attempt_id || index}><div className={`dashboard-project-cover cover-${index % 3}`} aria-hidden="true">대화 연습</div><h3>{item.scenario_title || item.title || "대화 연습"}</h3><p>{String(item.started_at || item.finished_at || "").slice(0,10) || "연습 기록"}</p><button type="button" onClick={onRecords}>기록 보기 →</button></article>) : <article className="member-empty"><h3>아직 연습이 없어요</h3><p>상황을 입력하거나 연습 템플릿으로 첫 대화를 준비해보세요.</p><button type="button" onClick={() => setProjectTab("연습 템플릿")}>연습 템플릿 둘러보기 →</button></article>}</div>
      </section>}
      {!dashboard && <HomeMotion key={mode.id}>
        {mode.id === "interview" && <InterviewHome onNext={focusPrompt} composer={footerComposer} />}
        {mode.id === "workplace" && <WorkplaceHome onNext={focusPrompt} composer={footerComposer} />}
      </HomeMotion>}
      <HomeFooter mode={mode.id} onNext={focusPrompt} onModeSelect={onModeSelect} />
    </section>
  );
}
