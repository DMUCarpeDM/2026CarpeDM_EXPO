import { useState } from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { BookOpen } from "reicon-react/icons/BookOpen";
import { Briefcase2 } from "reicon-react/icons/Briefcase2";
import { CalendarCheck } from "reicon-react/icons/CalendarCheck";
import { ChartBarTrendUp } from "reicon-react/icons/ChartBarTrendUp";
import { ChatDots } from "reicon-react/icons/ChatDots";
import { Check } from "reicon-react/icons/Check";
import { ClipboardCheck } from "reicon-react/icons/ClipboardCheck";
import { Clock3 } from "reicon-react/icons/Clock3";
import { FileText } from "reicon-react/icons/FileText";
import { Mic } from "reicon-react/icons/Mic";
import { Presentation } from "reicon-react/icons/Presentation";
import { ShieldCheck } from "reicon-react/icons/ShieldCheck";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { Target } from "reicon-react/icons/Target";
import { UserScan } from "reicon-react/icons/UserScan";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  Progress,
} from "../components/ui/shadcn";
import { resolveServiceHomeContent } from "../data/serviceHomeContent";

const questionFlow = [
  { icon: ChatDots, title: "핵심 질문", text: "지원 동기와 강점을 한 문장으로 정리해요." },
  { icon: Target, title: "꼬리 질문", text: "답변의 근거를 구체적인 경험으로 이어가요." },
  { icon: UserScan, title: "압박 질문", text: "당황해도 결론부터 차분하게 말해요." },
  { icon: Presentation, title: "마무리 질문", text: "질문과 입사 의지를 자연스럽게 전해요." },
];

const trainingScenarios = [
  { title: "고객 요청 확인", text: "요청을 듣고 핵심 과업을 정확히 정리해요.", meta: "기초 · 5분" },
  { title: "업무 순서 안내", text: "해야 할 일을 단계별로 설명하고 확인해요.", meta: "실무 · 8분" },
  { title: "문제 상황 대응", text: "예상 밖 상황에서 우선순위를 판단해요.", meta: "도전 · 10분" },
];

const workplaceScenarios = [
  ["팀장에게 진행 상황 보고", "진척·이슈·다음 행동을 짧게 공유해요."],
  ["동료에게 도움 요청", "상황과 필요한 지원을 분명하게 말해요."],
  ["의견이 다를 때 조율", "공통 목표를 확인하고 대안을 제안해요."],
  ["피드백 전달", "관찰한 사실과 기대 행동을 구분해 말해요."],
  ["회의에서 의견 제안", "결론과 근거를 순서대로 전달해요."],
  ["업무 일정 재협의", "제약을 설명하고 현실적인 일정을 맞춰요."],
];

const fitMetrics = [
  { icon: ChatDots, label: "응답", value: 82, detail: "핵심부터 말했어요" },
  { icon: Mic, label: "목소리", value: 76, detail: "속도가 안정적이에요" },
  { icon: UserScan, label: "표정", value: 84, detail: "상황에 맞게 반응했어요" },
  { icon: Presentation, label: "자세", value: 71, detail: "어깨를 조금 펴보세요" },
];

export function HomePage({ serviceMode, onNext }) {
  const mode = resolveServiceHomeContent(serviceMode?.id);

  return (
    <section className={`page home-page mode-home-page mode-home-page--${mode.id}`}>
      {mode.id === "interview" && <InterviewHome onNext={onNext} />}
      {mode.id === "training" && <TrainingHome onNext={onNext} />}
      {mode.id === "workplace" && <WorkplaceHome onNext={onNext} />}
    </section>
  );
}

function InterviewHome({ onNext }) {
  return (
    <>
      <section className="mode-section interview-hero">
        <div className="mode-copy interview-hero__copy">
          <Badge><Sparkles size={14} /> 실전 면접 시뮬레이션</Badge>
          <h1>날카로운 질문에도<br />답변의 중심을 잡아요</h1>
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
        <SectionIntro eyebrow="질문 흐름" title={<>면접의 네 단계를<br />이어서 연습해요</>} text="핵심 질문부터 마무리 질문까지, 강도가 달라져도 답변 흐름을 지켜요." />
        <div className="interview-question-grid">
          {questionFlow.map((item, index) => <FlowCard key={item.title} index={index + 1} {...item} />)}
        </div>
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

      <FooterCta title="다음 답변을 더 또렷하게 말해보세요" text="직무를 고르면 면접 연습을 바로 시작할 수 있어요." button="연습할 직무 고르기" onNext={onNext} />
    </>
  );
}

function TrainingHome({ onNext }) {
  return (
    <>
      <section className="mode-section training-hero">
        <div className="mode-copy training-hero__copy">
          <Badge><BookOpen size={14} /> 과업 중심 직업훈련</Badge>
          <h1>직접 해보며<br />현장 과업을 익혀요</h1>
          <p>현장에서 만나는 과업을 순서대로 수행해요. 막히면 AI 코치가 지금 필요한 행동을 알려드려요.</p>
          <div className="hero-actions mode-actions mode-actions--center">
            <Button size="lg" type="button" onClick={onNext}>연습할 직무 고르기 <ArrowRight size={18} /></Button>
            <Button size="lg" variant="outline" type="button" onClick={() => scrollToSection("training-scenarios")}>추천 과업 보기</Button>
          </div>
        </div>
        <TrainingTaskBoard />
      </section>

      <section className="mode-section training-steps">
        <div className="training-step-row">
          <ProcessCard number="01" icon={ClipboardCheck} title="과업 확인" text="오늘 완료할 일을 파악해요." compact />
          <ProcessCard number="02" icon={BookOpen} title="단계별 수행" text="순서대로 직접 해결해요." compact />
          <ProcessCard number="03" icon={ChartBarTrendUp} title="코칭 복습" text="잘한 점과 보완점을 확인해요." compact />
        </div>
      </section>

      <section className="mode-section" id="training-scenarios">
        <SectionIntro eyebrow="추천 과업" title="현장에서 자주 하는 일부터 연습해요" text="과업 하나를 골라 10분 안에 마쳐보세요." />
        <div className="training-scenario-grid">
          {trainingScenarios.map((scenario, index) => (
            <Card className="scenario-card training-scenario-card" key={scenario.title}>
              <CardContent>
                <span className="mode-icon"><Briefcase2 size={20} /></span>
                <small>과업 {index + 1}</small>
                <h3>{scenario.title}</h3>
                <p>{scenario.text}</p>
                <span className="scenario-meta">{scenario.meta}</span>
                <Button variant="ghost" size="sm" type="button" onClick={onNext}>직무 고르고 연습하기 <ArrowRight size={15} /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mode-section training-practice-section">
        <div className="training-guide">
          <SectionIntro eyebrow="실시간 코칭" title={<>지금 필요한 행동만<br />바로 확인해요</>} text="현재 단계에서 할 일과 완료 기준을 짧게 보여드려요." />
          <ul className="check-list">
            <li><Check size={16} /> 과업의 목표를 한 문장으로 확인</li>
            <li><Check size={16} /> 빠뜨린 단계가 있으면 즉시 안내</li>
            <li><Check size={16} /> 완료 후 다시 쓸 수 있는 코칭 제공</li>
          </ul>
        </div>
        <TrainingCoachPanel />
      </section>

      <section className="mode-section training-kpis">
        <SectionIntro eyebrow="성장 기록" title="과업을 마칠수록 성장 기록이 쌓여요" text="수행 시간, 정확도, 코칭 반영 정도를 함께 기록해요." align="center" />
        <div className="training-kpi-grid">
          <SimpleKpi icon={Clock3} value="18%" label="평균 수행 시간 단축" />
          <SimpleKpi icon={ShieldCheck} value="92%" label="과업 순서 정확도" />
          <SimpleKpi icon={ChartBarTrendUp} value="+24" label="최근 코칭 반영률" />
        </div>
      </section>

      <section className="mode-section training-faq">
        <SectionIntro eyebrow="자주 묻는 질문" title="훈련 전에 궁금한 점을 확인해요" />
        <Accordion type="single" collapsible>
          <Faq value="faq-1" title="처음부터 어려운 과업을 골라도 되나요?">기초 과업부터 시작하는 걸 추천해요. 한 번 완주한 뒤 같은 과업의 난이도를 높이면 변화가 더 잘 보여요.</Faq>
          <Faq value="faq-2" title="실수하면 훈련이 바로 끝나나요?">막힌 지점에서 다시 시도할 수 있어요. 필요하면 AI 코치가 다음 행동을 알려드려요.</Faq>
          <Faq value="faq-3" title="기존 시나리오는 어디에서 볼 수 있나요?">현재 준비된 기존 시나리오는 직업훈련 모드에 모아두었어요.</Faq>
        </Accordion>
      </section>

      <FooterCta title="오늘 연습할 과업을 골라보세요" text="반복하면 현장에서 더 빠르게 대응할 수 있어요." button="연습할 직무 고르기" onNext={onNext} />
    </>
  );
}

function WorkplaceHome({ onNext }) {
  return (
    <>
      <section className="mode-section workplace-hero">
        <div className="mode-copy workplace-hero__copy">
          <Badge><ChatDots size={14} /> 협업·보고·피드백</Badge>
          <h1>어려운 직장 대화도<br />먼저 연습해볼 수 있어요</h1>
          <p>보고, 요청, 조율, 피드백처럼 자주 하는 대화를 AI와 먼저 연습해보세요.</p>
          <div className="hero-actions mode-actions">
            <Button size="lg" type="button" onClick={onNext}>연습할 직무 고르기 <ArrowRight size={18} /></Button>
            <Button size="lg" variant="outline" type="button" onClick={() => scrollToSection("workplace-scenarios")}>추천 상황 보기</Button>
          </div>
          <TrustLine />
        </div>
        <RecommendedConversation onStart={onNext} />
      </section>

      <section className="mode-section" id="workplace-scenarios">
        <SectionIntro eyebrow="상황별 연습" title="지금 필요한 대화를 골라보세요" text="보고, 요청, 조율, 피드백 중 하나를 고르면 바로 연습을 시작해요." />
        <div className="workplace-scenario-grid">
          {workplaceScenarios.map(([title, text], index) => (
            <Card className="workplace-scenario-card" key={title}>
              <CardContent>
                <span className="scenario-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
                <Button variant="ghost" size="sm" type="button" onClick={onNext}>직무 고르고 연습하기 <ArrowRight size={15} /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mode-section workplace-workspace-section">
        <SectionIntro eyebrow="대화 워크스페이스" title={<>대화 목표부터 피드백까지<br />한 화면에서 확인해요</>} text="목표를 정하고 AI와 대화한 뒤, 바로 코칭을 확인해요." />
        <WorkplaceWorkspace />
      </section>

      <section className="mode-section workplace-process-strip">
        <ProcessCard number="01" icon={Target} title="목표 정하기" text="이번 대화에서 얻을 결과를 골라요." compact />
        <ProcessCard number="02" icon={ChatDots} title="대화하기" text="AI 상대와 자연스럽게 대화해요." compact />
        <ProcessCard number="03" icon={FileText} title="피드백 받기" text="다음 대화에 쓸 표현을 확인해요." compact />
      </section>

      <section className="mode-section workplace-feedback">
        <div>
          <SectionIntro eyebrow="4-Fit 피드백" title={<>대화 습관 네 가지를<br />함께 살펴봐요</>} text="응답, 목소리, 표정, 자세를 하나의 대화 맥락으로 설명해요." />
          <div className="fit-metric-grid fit-metric-grid--compact">
            {fitMetrics.map((metric) => <FitMetric key={metric.label} {...metric} />)}
          </div>
        </div>
        <Card className="coaching-card">
          <CardContent>
            <Badge variant="outline">이번 코칭</Badge>
            <h3>의견이 다를 때는<br />공통 목표부터 확인해보세요</h3>
            <p>“일정을 지키면서 품질도 확보하려면 어떤 선택이 좋을까요?”처럼 함께 풀 문제로 바꾸면 대화가 부드러워져요.</p>
            <Button variant="outline" type="button" onClick={onNext}>연습할 직무 고르기</Button>
          </CardContent>
        </Card>
      </section>

      <section className="mode-section workplace-growth">
        <SectionIntro eyebrow="최근 성장" title={<>반복할수록<br />표현이 또렷해져요</>} />
        <div className="growth-grid">
          <GrowthItem label="핵심 먼저 말하기" value={88} />
          <GrowthItem label="의견과 근거 연결" value={76} />
          <GrowthItem label="대안 제시하기" value={81} />
        </div>
      </section>

      <FooterCta title="어려운 대화 전에 먼저 연습해보세요" text="직무를 고르면 AI 동료와 대화를 시작할 수 있어요." button="연습할 직무 고르기" onNext={onNext} />
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

function TrainingTaskBoard() {
  const tasks = ["고객 요청 듣기", "핵심 내용 정리", "처리 순서 안내", "마무리 확인"];
  const [activeTask, setActiveTask] = useState(1);

  return (
    <Card className="training-task-board">
      <div className="task-board__top"><strong>오늘의 과업</strong><Badge variant="outline">진행 중</Badge></div>
      <div className="task-board__body">
        <nav aria-label="과업 단계">
          {tasks.map((task, index) => (
            <button className={activeTask === index ? "active" : ""} type="button" onClick={() => setActiveTask(index)} key={task}>
              <span>{index < activeTask ? <Check size={14} /> : index + 1}</span>{task}
            </button>
          ))}
        </nav>
        <div className="task-board__work">
          <small>STEP {activeTask + 1}</small>
          <h2>{tasks[activeTask]}</h2>
          <p>상대방의 말을 끝까지 듣고, 요청 내용을 한 문장으로 확인해보세요.</p>
          <div className="coach-note"><Sparkles size={17} /><span><b>AI 코치</b> “제가 이해한 내용이 맞는지 확인할게요”로 시작해보세요.</span></div>
          <Progress value={(activeTask + 1) * 25} />
          <div className="task-board__actions">
            <Button variant="outline" size="sm" type="button" onClick={() => setActiveTask(Math.max(0, activeTask - 1))}>이전</Button>
            <Button size="sm" type="button" onClick={() => setActiveTask(Math.min(tasks.length - 1, activeTask + 1))}>다음 단계</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TrainingCoachPanel() {
  return (
    <Card className="training-coach-panel">
      <div className="coach-panel__header"><span><i /> 과업 수행 중</span><Badge variant="neutral">02:18</Badge></div>
      <CardContent>
        <small>현재 단계</small>
        <h3>요청 내용을 다시 확인하세요</h3>
        <div className="coach-dialogue"><span>고객</span><p>이번 주 금요일까지 변경된 내용을 받을 수 있을까요?</p></div>
        <div className="coach-response"><Mic size={18} /><span>“금요일까지 변경본을 전달드리면 될까요?”</span></div>
        <Button type="button">응답 제출하기 <ArrowRight size={16} /></Button>
      </CardContent>
    </Card>
  );
}

function RecommendedConversation({ onStart }) {
  return (
    <Card className="recommended-conversation">
      <div className="recommended-conversation__head"><Badge>오늘의 추천</Badge><span>약 7분</span></div>
      <CardContent>
        <span className="mode-icon"><CalendarCheck size={22} /></span>
        <h2>팀장에게 진행 상황 보고하기</h2>
        <p>진행된 일, 막힌 일, 다음 행동을 1분 안에 정리해 말해보세요.</p>
        <div className="conversation-participants"><span>나</span><i /><span>AI 팀장</span></div>
        <Button type="button" onClick={onStart}>직무 고르고 연습하기 <ArrowRight size={17} /></Button>
      </CardContent>
    </Card>
  );
}

function WorkplaceWorkspace() {
  const [activeLine, setActiveLine] = useState(0);
  const lines = ["진행 상황부터 보고할게요.", "현재 막힌 점은 API 검토예요.", "오늘 안에 대안을 정리하겠습니다."];

  return (
    <Card className="workplace-workspace">
      <div className="workspace-column workspace-brief">
        <small>대화 목표</small>
        <h3>진행 상황을 짧고 분명하게 보고하기</h3>
        <ul><li><Check size={14} /> 완료한 일</li><li><Check size={14} /> 막힌 일</li><li><Check size={14} /> 다음 행동</li></ul>
      </div>
      <div className="workspace-column workspace-chat">
        <div className="workspace-chat__head"><span><i /> AI 팀장</span><Badge variant="neutral">대화 중</Badge></div>
        <div className="chat-message incoming">오늘 진행 상황을 짧게 공유해 주세요.</div>
        <div className="chat-message outgoing">{lines[activeLine]}</div>
        <div className="workspace-replies">
          {lines.map((line, index) => <button className={activeLine === index ? "active" : ""} type="button" onClick={() => setActiveLine(index)} key={line}>{line}</button>)}
        </div>
      </div>
      <div className="workspace-column workspace-coach">
        <small>실시간 코칭</small>
        <h3>결론을 먼저 말했어요</h3>
        <Progress value={82} />
        <p>이제 막힌 점과 필요한 지원을 한 문장으로 덧붙여보세요.</p>
        <Badge variant="outline"><Sparkles size={13} /> 추천 표현</Badge>
        <blockquote>“일정에 영향을 줄 수 있어 오늘 확인이 필요합니다.”</blockquote>
      </div>
    </Card>
  );
}

function SectionIntro({ eyebrow, title, text, align = "left" }) {
  return <div className={`section-intro section-intro--${align}`}><span>{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>;
}

function FlowCard({ icon: Icon, index, title, text }) {
  return <Card className="flow-card"><CardContent><span className="flow-card__number">0{index}</span><span className="mode-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></CardContent></Card>;
}

function ProcessCard({ icon: Icon, number, title, text, compact = false }) {
  return <article className={`process-card ${compact ? "process-card--compact" : ""}`}><span>{number}</span><i className="mode-icon"><Icon size={21} /></i><h3>{title}</h3><p>{text}</p></article>;
}

function FitMetric({ icon: Icon, label, value, detail }) {
  return <Card className="fit-metric"><CardContent><div className="fit-metric__head"><span className="mode-icon"><Icon size={19} /></span><b>{label}</b><strong>{value}</strong></div><Progress value={value} /><p>{detail}</p></CardContent></Card>;
}

function SimpleKpi({ icon: Icon, value, label }) {
  return <Card className="simple-kpi"><CardContent><span className="mode-icon"><Icon size={20} /></span><strong>{value}</strong><p>{label}</p></CardContent></Card>;
}

function GrowthItem({ label, value }) {
  return <div className="growth-item"><div><strong>{label}</strong><span>{value}%</span></div><Progress value={value} /></div>;
}

function Faq({ value, title, children }) {
  return <AccordionItem value={value}><AccordionTrigger>{title}</AccordionTrigger><AccordionContent>{children}</AccordionContent></AccordionItem>;
}

function TrustLine() {
  return <div className="mode-trust-line"><ShieldCheck size={16} /><span>영상과 음성은 기기 안에서 분석해요</span></div>;
}

function FooterCta({ title, text, button, onNext }) {
  return (
    <section className="mode-footer-cta">
      <div><h2>{title}</h2><p>{text}</p></div>
      <Button size="lg" type="button" onClick={onNext}>{button} <ArrowRight size={18} /></Button>
    </section>
  );
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
