import { useState } from "react";
import { RisingHeadline } from "./OriginHomeEffects";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { BookOpen } from "reicon-react/icons/BookOpen";
import { Briefcase2 } from "reicon-react/icons/Briefcase2";
import { ChartBarTrendUp } from "reicon-react/icons/ChartBarTrendUp";
import { Check } from "reicon-react/icons/Check";
import { ClipboardCheck } from "reicon-react/icons/ClipboardCheck";
import { Clock3 } from "reicon-react/icons/Clock3";
import { Mic } from "reicon-react/icons/Mic";
import { ShieldCheck } from "reicon-react/icons/ShieldCheck";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, Card, CardContent, Progress } from "../ui/shadcn";
import trainingWorkScene from "../../assets/home-scenes/training-work-scene.webp";
import { ContextVisual, SectionIntro, ProcessCard, FooterCta, scrollToSection } from "./HomeSections";

const trainingScenarios = [
  { title: "고객 요청 확인", text: "요청을 듣고 핵심 과업을 정확히 정리해요.", meta: "기초 · 5분" },
  { title: "업무 순서 안내", text: "해야 할 일을 단계별로 설명하고 확인해요.", meta: "실무 · 8분" },
  { title: "문제 상황 대응", text: "예상 밖 상황에서 우선순위를 판단해요.", meta: "도전 · 10분" },
];

export function TrainingHome({ onNext }) {
  return (
    <>
      <section className="mode-section training-hero">
        <div className="mode-copy training-hero__copy">
          <Badge><BookOpen size={14} /> 과업 중심 직업훈련</Badge>
          <RisingHeadline lines={["직접 해보며", "현장 과업을 익혀요"]} />
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
        <SectionIntro highlight eyebrow="추천 과업" title="현장에서 자주 하는 일부터 연습해요" text="과업 하나를 골라 10분 안에 마쳐보세요." />
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

      <ContextVisual
        image={trainingWorkScene}
        alt="밝은 직업훈련 공간에서 태블릿을 참고하며 과업을 수행하는 사람"
        eyebrow="현장에서 쓰는 방식으로"
        title={<>설명만 듣지 않고<br />직접 끝까지 해봐요</>}
        text="해야 할 일을 눈으로 확인하고 손으로 수행하면서, 빠뜨린 단계는 AI 코치의 안내로 바로 보완해요."
        align="right"
      />

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

function SimpleKpi({ icon: Icon, value, label }) {
  return <Card className="simple-kpi"><CardContent><span className="mode-icon"><Icon size={20} /></span><strong>{value}</strong><p>{label}</p></CardContent></Card>;
}

function Faq({ value, title, children }) {
  return <AccordionItem value={value}><AccordionTrigger>{title}</AccordionTrigger><AccordionContent>{children}</AccordionContent></AccordionItem>;
}
