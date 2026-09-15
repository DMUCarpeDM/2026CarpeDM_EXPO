import { useState } from "react";
import { RisingHeadline } from "./OriginHomeEffects";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ChartBarTrendUp } from "reicon-react/icons/ChartBarTrendUp";
import { ChatDots } from "reicon-react/icons/ChatDots";
import { Clock3 } from "reicon-react/icons/Clock3";
import { Mic } from "reicon-react/icons/Mic";
import { Presentation } from "reicon-react/icons/Presentation";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { Target } from "reicon-react/icons/Target";
import { UserScan } from "reicon-react/icons/UserScan";
import { Badge, Button, Card, CardContent, Progress } from "../ui/shadcn";
import interviewPracticeScene from "../../assets/home-scenes/interview-practice-scene.webp";
import { fitMetrics, EvidenceStrip, ContextVisual, SectionIntro, ProcessCard, FitMetric, TrustLine, FooterCta, scrollToSection } from "./HomeSections";

const questionFlow = [
  { icon: ChatDots, title: "핵심 질문", text: "지원 동기와 강점을 한 문장으로 정리해요." },
  { icon: Target, title: "꼬리 질문", text: "답변의 근거를 구체적인 경험으로 이어가요." },
  { icon: UserScan, title: "압박 질문", text: "당황해도 결론부터 차분하게 말해요." },
  { icon: Presentation, title: "마무리 질문", text: "질문과 입사 의지를 자연스럽게 전해요." },
];

export function InterviewHome({ onNext }) {
  return (
    <>
      <section className="mode-section interview-hero">
        <div className="mode-copy interview-hero__copy">
          <Badge><Sparkles size={14} /> 실전 면접 시뮬레이션</Badge>
          <RisingHeadline lines={["날카로운 질문에도", "답변의 중심을 잡아요"]} />
          <p>실제 면접처럼 질문에 답해보세요. 답변, 목소리, 표정, 자세를 함께 살펴보고 다음 답변에서 바꿀 점을 알려드려요.</p>
          <div className="hero-actions mode-actions">
            <Button size="lg" type="button" onClick={onNext}>연습할 직무 고르기 <ArrowRight size={18} /></Button>
            <Button size="lg" variant="outline" type="button" onClick={() => scrollToSection("interview-flow")}>연습 과정 보기</Button>
          </div>
          <TrustLine />
        </div>
        <InterviewPracticeConsole onStart={onNext} />
      </section>

      <section className="mode-section" id="interview-flow">
        <SectionIntro highlight eyebrow="질문 흐름" title={<>면접의 네 단계를<br />이어서 연습해요</>} text="핵심 질문부터 마무리 질문까지, 강도가 달라져도 답변 흐름을 지켜요." />
        <div className="interview-question-grid">
          {questionFlow.map((item, index) => <FlowCard key={item.title} index={index + 1} {...item} />)}
        </div>
      </section>

      <section className="mode-section mode-section--canvas interview-report-showcase">
        <SectionIntro eyebrow="연습 직후 리포트" title={<>한 번의 답변에서도<br />다음 행동을 찾아요</>} text="점수만 보여주지 않고 잘한 점, 놓친 부분, 바로 바꿀 행동을 한 흐름으로 설명해요." align="center" />
        <ProductStage label="면접 코칭 리포트 미리보기">
          <InterviewReportPreview />
        </ProductStage>
      </section>

      <section className="mode-section interview-process">
        <SectionIntro eyebrow="연습 방법" title="세 단계로 연습해요" text="직무를 고르고, 실제처럼 답한 뒤 바로 코칭을 확인해요." align="center" />
        <div className="process-grid">
          <ProcessCard number="01" icon={Target} title="상황 고르기" text="지원 직무와 면접 단계를 골라요." />
          <ProcessCard number="02" icon={Mic} title="질문에 답하기" text="카메라 앞에서 평소처럼 말해요." />
          <ProcessCard number="03" icon={ChartBarTrendUp} title="코칭 확인하기" text="다음 답변에 쓸 한 가지를 정해요." />
        </div>
      </section>

      <section className="mode-section interview-feedback">
        <SectionIntro eyebrow="4-Fit 코칭" title={<>다음 답변에서<br />바꿀 점을 확인해요</>} text="응답, 목소리, 표정, 자세를 함께 보고 바로 실천할 행동을 알려드려요." />
        <div className="fit-metric-grid">
          {fitMetrics.map((metric) => <FitMetric key={metric.label} {...metric} />)}
        </div>
      </section>

      <EvidenceStrip items={[
        ["4가지", "한 번에 보는 말하기 신호"],
        ["1개", "다음 답변의 우선 행동"],
        ["기기 안", "영상·음성 분석 방식"],
      ]} />

      <ContextVisual
        image={interviewPracticeScene}
        alt="밝은 공간에서 노트북 카메라를 보며 면접 답변을 연습하는 사람"
        eyebrow="실전 전 반복 연습"
        title={<>낯선 질문도<br />내 답변으로 바꿔보세요</>}
        text="실수해도 괜찮은 환경에서 여러 번 말해보면, 실제 면접에서도 답변의 중심을 더 빨리 찾을 수 있어요."
      />

      <FooterCta title="다음 답변을 더 또렷하게 말해보세요" text="직무를 고르면 면접 연습을 바로 시작할 수 있어요." button="연습할 직무 고르기" onNext={onNext} />
    </>
  );
}

function InterviewPracticeConsole({ onStart }) {
  const questions = ["1분 자기소개를 해주세요.", "지원한 직무를 선택한 이유는 무엇인가요?", "실패를 바꾼 경험을 말해주세요."];
  const [activeQuestion, setActiveQuestion] = useState(0);

  return (
    <Card className="practice-console interview-console">
      <div className="console-head"><span><i /> 실전 면접</span><Badge variant="neutral"><Clock3 size={13} /> 00:37</Badge></div>
      <div className="console-stage">
        <small>질문 {activeQuestion + 1} / {questions.length}</small>
        <h2>{questions[activeQuestion]}</h2>
        <p>답변을 시작하면 목소리와 표정, 자세를 함께 살펴봐요.</p>
        <div className="console-wave" aria-label="마이크 입력 대기"><Mic size={22} /><span>답변을 기다리고 있어요</span></div>
      </div>
      <div className="console-question-tabs" aria-label="면접 질문 선택">
        {questions.map((question, index) => <button aria-label={`질문 ${index + 1}: ${question}`} className={activeQuestion === index ? "active" : ""} type="button" onClick={() => setActiveQuestion(index)} key={question}>{index + 1}</button>)}
      </div>
      <Button type="button" onClick={onStart}>직무 고르고 연습하기 <ArrowRight size={17} /></Button>
    </Card>
  );
}

function ProductStage({ label, children }) {
  return (
    <div className="product-stage" aria-label={label}>
      <div className="product-stage__label"><span>{label}</span><Badge variant="neutral">서비스 화면</Badge></div>
      <div className="product-stage__body">{children}</div>
    </div>
  );
}

function InterviewReportPreview() {
  return (
    <div className="interview-report-preview">
      <div className="report-preview-summary">
        <Badge variant="outline">연습 완료</Badge>
        <small>개발자 직무 · 실무 면접</small>
        <strong>82</strong>
        <span>/ 100</span>
        <h3>핵심부터 답한 점이 좋았어요</h3>
        <p>이제 경험을 한 가지 덧붙이면 답변의 근거가 더 또렷해져요.</p>
      </div>
      <div className="report-preview-fits">
        {fitMetrics.map((metric) => (
          <div className="report-preview-fit" key={metric.label}>
            <div><span>{metric.label}</span><b>{metric.value}</b></div>
            <Progress value={metric.value} />
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
      <div className="report-preview-action">
        <span><Sparkles size={16} /> 다음 답변에서 바꿀 한 가지</span>
        <h3>결론 뒤에 구체적인 경험을 한 문장으로 붙여보세요</h3>
        <p>“프로젝트 일정이 늦어졌을 때 우선순위를 다시 정해 마감일을 지킨 경험이 있습니다.”</p>
      </div>
    </div>
  );
}

function FlowCard({ icon: Icon, index, title, text }) {
  return <Card className="flow-card"><CardContent><span className="flow-card__number">0{index}</span><span className="mode-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></CardContent></Card>;
}
