import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Mic } from "reicon-react/icons/Mic";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { Button } from "../ui/shadcn";
import { HeroBackdrop } from "./HeroBackdrop";
import { IntroWaves } from "./IntroWaves";
import { scrollToSection } from "./HomeSections";
import "../../styles/studio-intro.css";

const examples = {
  interview: {
    label: "면접", headline: ["첫 면접도,", "나답게."],
    description: "머릿속으로만 준비했던 답변을 말해보세요. 다음 면접에서 바꿀 한 가지까지 함께 찾아요.",
    context: "개발자 · 지원 동기", question: "이 직무에 지원한 이유를 말씀해 주세요.",
    answer: "사용자의 불편을 해결하는 개발자가 되고 싶습니다.",
    detail: "팀 프로젝트에서 예약 과정을 간소화하며, 작은 변화가 사용 경험을 바꾼다는 걸 배웠습니다.",
    feedback: "지원 이유를 먼저 말한 점이 좋아요. 직접 해결한 문제를 한 가지 덧붙여보세요.",
    action: "결론 뒤에 경험 한 문장 붙이기", start: "연습할 직무 고르기",
  },
  training: {
    label: "직업훈련", headline: ["처음 하는 일도,", "한 단계씩."],
    description: "주문을 듣고, 확인하고, 안내하는 순간까지. 현장에서 필요한 말을 미리 연습해요.",
    context: "카페 · 주문 확인", question: "아이스 아메리카노 한 잔, 포장해 주세요.",
    answer: "아메리카노 한 잔 맞으실까요?",
    detail: "아이스 아메리카노 한 잔, 포장으로 준비해 드리겠습니다.",
    feedback: "음료 수량을 확인했어요. 온도와 포장 여부도 함께 말하면 주문이 더 정확해져요.",
    action: "음료 · 온도 · 수량 · 포장 여부 확인하기", start: "연습할 직무 고르기",
  },
  workplace: {
    label: "직장대화", headline: ["어려운 대화도,", "내 말로."],
    description: "보고부터 의견 조율까지, 부담되는 대화를 먼저 연습해보세요. 더 또렷하게 전할 방법을 찾아요.",
    context: "업무 · 진행 상황 보고", question: "오늘 진행 상황을 짧게 공유해 주세요.",
    answer: "화면 구현은 끝났고, API 검토가 남아 있습니다.",
    detail: "오늘 오후에 검토를 마치고, 내일 오전까지 연결 결과를 공유하겠습니다.",
    feedback: "완료한 일과 남은 일을 구분했어요. 다음 행동과 예상 시간을 덧붙여보세요.",
    action: "다음 행동과 일정 함께 말하기", start: "연습 시작하기",
  },
};

const steps = [
  { label: "질문", title: "실제처럼, 질문을 마주하고.", text: "상황에 맞는 질문으로 시작해요. 어떤 말을 해야 할지 혼자 고민하지 않아도 돼요." },
  { label: "답변", title: "외운 문장 대신, 내 말로.", text: "평소 말하는 방식으로 답해보세요. 답변뿐 아니라 목소리, 표정, 자세도 함께 살펴봐요." },
  { label: "피드백", title: "점수 너머, 바꿀 한 가지.", text: "잘한 점을 확인하고 다음 답변에서 실천할 행동을 찾아요." },
  { label: "다시 연습", title: "알게 된 것을, 다음 한 문장에.", text: "피드백을 반영한 표현을 떠올려보세요. 다시 말하는 순간이 다음 연습의 시작이에요." },
];

const interviewQuestions = [
  { label: "핵심 질문", question: "이 직무에 지원한 이유를 말씀해 주세요." },
  { label: "꼬리 질문", question: "그 경험에서 본인이 맡은 역할은 무엇인가요?" },
  { label: "직무 질문", question: "사용자 요청이 서버에 전달되는 과정을 설명해 주세요." },
  { label: "마무리 질문", question: "마지막으로 전하고 싶은 말이 있나요?" },
];

function Waveform() {
  return <div className="studio-wave" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ "--bar": `${12 + ((i * 17 + 9) % 35)}px`, "--delay": `${i * 23}ms` }} />)}</div>;
}

function Scene({ example, step }) {
  return (
    <div className="studio-scene">
      <div className="studio-scene__meta"><span>{example.context}</span><span>예시</span></div>
      <div className="studio-question"><small>AI 상대의 질문</small><h3>{example.question}</h3></div>
      {step === 0 ? <p className="studio-hint">완벽한 답보다, 지금의 내 답변부터.</p> : <>
        <div className="studio-answer"><small>{step === 3 ? "피드백을 반영한 답변 예시" : "나의 답변 예시"}</small><p>{example.answer}</p>{step === 3 && <p className="studio-answer__addition">{example.detail}</p>}</div>
        {step === 1 && <div className="studio-audio"><Mic size={17} aria-hidden="true" /><Waveform /><span>음성 예시</span></div>}
        {step === 2 && <div className="studio-note"><Sparkles size={18} aria-hidden="true" /><div><strong>다음 답변에서 바꿀 한 가지</strong><p>{example.action}</p></div></div>}
      </>}
    </div>
  );
}

function WindowBar({ label }) {
  return <div className="studio-window-bar"><span className="studio-window-dots" aria-hidden="true"><i /><i /><i /></span><span>{label}</span><span className="studio-demo-label">체험 예시</span></div>;
}

export function StudioIntro({ mode, onNext }) {
  const example = examples[mode];
  const [active, setActive] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [scrollStep, setScrollStep] = useState(mode === "interview" ? 1 : 0);
  const tourSteps = mode === "interview" ? steps.slice(1) : steps;
  const tourOffset = mode === "interview" ? 1 : 0;
  const walkthrough = useRef(null);
  const walkthroughId = `${mode}-studio-tour`;

  useEffect(() => {
    const query = matchMedia("(min-width: 901px) and (prefers-reduced-motion: no-preference)");
    const observer = new IntersectionObserver((entries) => {
      if (!query.matches) return;
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length) setScrollStep(Number(visible[0].target.dataset.step));
    }, { rootMargin: "-35% 0px -35% 0px", threshold: 0 });
    walkthrough.current.querySelectorAll("[data-step]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return <>
    <section className="mode-section studio-hero">
      <HeroBackdrop />
      <div className="studio-hero__copy">
        <h1>{example.headline[0]} <em>{example.headline[1]}</em></h1>
        <p>{example.description}</p>
        <div className="studio-hero__actions"><Button size="lg" type="button" onClick={onNext}>{example.start}<ArrowRight size={18} /></Button><Button size="lg" variant="outline" type="button" onClick={() => scrollToSection(walkthroughId)}>어떻게 연습하나요?</Button></div>
      </div>
      <div className="studio-window" aria-label={`${example.label} 연습 스튜디오 예시`}>
        <WindowBar label="Mirror-Ting Studio" />
        <div className="studio-layout">
          <nav className="studio-explorer" aria-label="소개 데모 단계"><small>연습 살펴보기</small>{steps.map((step, index) => <button key={step.label} type="button" aria-pressed={active === index} onClick={() => setActive(index)}><span aria-hidden="true">0{index + 1}</span>{step.label}</button>)}<div className="studio-explorer__brand"><img src="/icons/mirror-ting-mark-slim.png" alt="" /><span>나를 위한<br />대화 연습 공간</span></div></nav>
          <div className="studio-editor"><div className="studio-file"><span aria-hidden="true">◈</span> {example.label} / {steps[active].label}<span className="studio-file__suffix">미리보기</span></div>
            {mode === "interview" && active === 0 && <nav className="studio-question-types" aria-label="면접 질문 종류">{interviewQuestions.map((item, index) => <button key={item.label} type="button" aria-pressed={questionIndex === index} onClick={() => setQuestionIndex(index)}>{item.label}</button>)}</nav>}
            <div aria-live="polite" aria-atomic="true"><Scene example={mode === "interview" && active === 0 ? { ...example, context: `개발자 · ${interviewQuestions[questionIndex].label}`, question: interviewQuestions[questionIndex].question } : example} step={active} /></div></div>
          <aside className="studio-inspector"><span className="studio-inspector__title"><Sparkles size={16} aria-hidden="true" /> 코칭 노트</span><small>이런 피드백을 받을 수 있어요</small><p>{example.feedback}</p><div className="studio-signals">{["응답", "목소리", "표정", "자세"].map((label) => <span key={label}>{label}<i aria-hidden="true" /></span>)}</div><span className="studio-inspector__foot">4-Fit · 말과 비언어 신호</span></aside>
        </div>
        <div className="studio-status"><span><span aria-hidden="true">⌁</span> {example.label} 연습</span><span>소개용 예시 · 녹음되지 않아요</span></div>
      </div>
      <p className="studio-caption">단계를 눌러 연습 흐름을 살펴보세요. 실제 연습은 위 버튼에서 시작해요.</p>
    </section>

    <section ref={walkthrough} className="mode-section studio-tour" id={walkthroughId} aria-label="단계별 연습 안내">
      <IntroWaves />
      <div className="studio-tour__heading"><h2>한 번의 대화가<br />다음의 나를 바꾸도록.</h2><p>{mode === "interview" ? "내 답변, 피드백, 그리고 더 또렷해진 한 문장." : "질문부터 다시 연습하기까지, 한 흐름으로."}</p></div>
      <div className="studio-tour__layout">
        <div className="studio-tour__steps">{tourSteps.map((step, index) => <article key={step.label} data-step={index + tourOffset} className="studio-tour__step"><span className="studio-step-number">0{index + 1} / {step.label}</span><h3>{step.title}</h3><p>{step.text}</p><div className="studio-tour__mobile-scene"><Scene example={example} step={index + tourOffset} /></div>{mode !== "interview" && index === 3 && <Button type="button" onClick={onNext}>{example.start}<ArrowRight size={16} /></Button>}</article>)}</div>
        <div className="studio-tour__preview"><div className="studio-window"><WindowBar label="연습의 다음 장면" /><nav className="studio-tour__controls" aria-label="단계별 예시 선택">{tourSteps.map((step, index) => <button type="button" key={step.label} aria-pressed={scrollStep === index + tourOffset} onClick={() => setScrollStep(index + tourOffset)}>{step.label}</button>)}</nav><Scene example={example} step={scrollStep} /><div className="studio-pipeline" aria-label="응답, 목소리, 표정, 자세를 종합한 코칭"><div>{["응답", "목소리", "표정", "자세"].map((label) => <span key={label}>{label}</span>)}</div><span className="studio-pipeline__line" aria-hidden="true" /><strong>4-Fit 코칭</strong></div></div><p className="studio-caption">설명을 위한 예시이며 실제 분석 결과가 아닙니다.</p></div>
      </div>
    </section>
  </>;
}
