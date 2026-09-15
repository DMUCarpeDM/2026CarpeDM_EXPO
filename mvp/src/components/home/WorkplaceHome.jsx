import { useState } from "react";
import { RisingHeadline } from "./OriginHomeEffects";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarCheck } from "reicon-react/icons/CalendarCheck";
import { ChatDots } from "reicon-react/icons/ChatDots";
import { Check } from "reicon-react/icons/Check";
import { FileText } from "reicon-react/icons/FileText";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { Target } from "reicon-react/icons/Target";
import { Badge, Button, Card, CardContent, Progress } from "../ui/shadcn";
import workplaceConversationScene from "../../assets/home-scenes/workplace-conversation-scene.webp";
import { fitMetrics, EvidenceStrip, ContextVisual, SectionIntro, ProcessCard, FitMetric, TrustLine, FooterCta, scrollToSection } from "./HomeSections";

const workplaceScenarios = [
  ["팀장에게 진행 상황 보고", "진척·이슈·다음 행동을 짧게 공유해요."],
  ["동료에게 도움 요청", "상황과 필요한 지원을 분명하게 말해요."],
  ["의견이 다를 때 조율", "공통 목표를 확인하고 대안을 제안해요."],
  ["피드백 전달", "관찰한 사실과 기대 행동을 구분해 말해요."],
  ["회의에서 의견 제안", "결론과 근거를 순서대로 전달해요."],
  ["업무 일정 재협의", "제약을 설명하고 현실적인 일정을 맞춰요."],
];

export function WorkplaceHome({ onNext }) {
  return (
    <>
      <section className="mode-section workplace-hero">
        <div className="mode-copy workplace-hero__copy">
          <Badge><ChatDots size={14} /> 협업·보고·피드백</Badge>
          <RisingHeadline lines={["어려운 직장 대화도", "먼저 연습해볼 수 있어요"]} />
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
        <SectionIntro highlight eyebrow="상황별 연습" title="지금 필요한 대화를 골라보세요" text="보고, 요청, 조율, 피드백 중 하나를 고르면 바로 연습을 시작해요." />
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

      <section className="mode-section mode-section--canvas workplace-compare-section">
        <SectionIntro eyebrow="표현 비교" title={<>같은 내용도<br />더 편하게 전달할 수 있어요</>} text="대화 전후 표현을 나란히 보며 상대가 이해하기 쉬운 순서와 말투를 익혀요." />
        <DialogueComparison />
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

      <EvidenceStrip items={[
        ["3단계", "목표·대화·코칭 흐름"],
        ["4-Fit", "말과 비언어 신호 분석"],
        ["매회", "저장되는 성장 기록"],
      ]} />

      <ContextVisual
        image={workplaceConversationScene}
        alt="밝은 회의실에서 차분하게 업무 대화를 나누는 두 직장인"
        eyebrow="어려운 대화 전 리허설"
        title={<>상대와 마주하기 전에<br />먼저 말해볼 수 있어요</>}
        text="보고, 요청, 조율처럼 부담되는 대화를 미리 연습하면 실제 자리에서는 핵심과 근거에 더 집중할 수 있어요."
      />

      <FooterCta title="어려운 대화 전에 먼저 연습해보세요" text="직무를 고르면 AI 동료와 대화를 시작할 수 있어요." button="연습할 직무 고르기" onNext={onNext} />
    </>
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

function DialogueComparison() {
  return (
    <div className="dialogue-comparison">
      <div className="dialogue-version dialogue-version--before">
        <Badge variant="neutral">연습 전</Badge>
        <h3>“일정이 조금 어려울 것 같은데요…”</h3>
        <p>상황과 필요한 결정이 드러나지 않아 상대가 다시 물어봐야 해요.</p>
      </div>
      <ArrowRight className="dialogue-comparison__arrow" size={28} aria-hidden="true" />
      <div className="dialogue-version dialogue-version--after">
        <Badge variant="outline">코칭 반영</Badge>
        <h3>“현재 일정은 이틀 조정이 필요합니다. 오늘 우선순위를 함께 정하고 싶어요.”</h3>
        <p>결론, 이유, 요청을 순서대로 말해 상대가 바로 판단할 수 있어요.</p>
      </div>
    </div>
  );
}

function GrowthItem({ label, value }) {
  return <div className="growth-item"><div><strong>{label}</strong><span>{value}%</span></div><Progress value={value} /></div>;
}
