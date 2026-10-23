import { useState } from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ChatDots } from "reicon-react/icons/ChatDots";
import { Badge, Button, Card, CardContent } from "../ui/shadcn";
import { FitGridBackground } from "./FitGridBackground";
import { FitAnalysisPages } from "./FitAnalysisPages";
import "../../styles/service-introduction.css";

const stages = [
  { label: "상황 입력", title: "연습할 상황을 적어요", text: "누구와 어떤 대화를 연습할지 적어요. AI가 상황에 맞는 상대 역할을 맡아요." },
  { label: "AI와 대화", title: "AI와 대화를 나눠요", text: "AI가 내 답변에 맞춰 다음 질문을 해요. 내 말로 편하게 답해보세요." },
  { label: "피드백", title: "바꾸고 싶은 점을 찾아요", text: "피드백을 보고 바꾸고 싶은 표현이나 행동을 다시 연습해요." },
];
const examples = {
  interview: { prompt: "신입 개발자 면접에서 프로젝트 경험을 설명하고 추가 질문에 답하고 싶어요.", setting: "신입 개발자 · 실무 면접", persona: "면접관", question: "프로젝트에서 가장 어려웠던 문제는 무엇인가요? 어떻게 해결했는지도 알려주세요.", answer: "배포가 늦어졌을 때 작업의 우선순위를 다시 정했습니다.", feedback: "내가 한 행동 뒤에, 그 결과를 한 문장 덧붙여보세요.", detail: "문제 → 나의 행동 → 결과 순서로 말하면 경험이 더 또렷하게 전달돼요." },
  workplace: { prompt: "팀장에게 일정이 늦어진 이유를 설명하고 먼저 할 일을 정하고 싶어요.", setting: "일정 조율 · 팀장과의 대화", persona: "팀장", question: "이번 주 안에 마치려면 어떤 조정이 필요할까요?", answer: "검증 시간이 더 필요해서, 먼저 완료할 범위를 함께 정하고 싶습니다.", feedback: "상대와 함께 정할 일을 구체적으로 말해보세요.", detail: "현재 상황을 설명하고, 가능한 방법과 함께 정할 일을 말해보세요." },
};

export function ServiceIntroduction({ mode, onNext }) {
  const [active, setActive] = useState(0);
  const example = examples[mode] || examples.workplace;
  return (
    <div className="service-introduction">
      <section className="intro-overview" id={`${mode}-overview`} aria-labelledby={`${mode}-intro-title`}>
        <div className="intro-heading-row">
          <div><span className="intro-eyebrow">AI와 대화 연습</span><h2 id={`${mode}-intro-title`}>{mode === "interview" ? <>생각해둔 답변을,<br />내 말로 연습해요.</> : <>연습할 상황을 적으면,<br />AI가 대화 상대가 돼요.</>}</h2></div>
        </div>
        <div className="intro-process" id={`${mode}-practice-preview`}>
          <div className="intro-process-copy">
            <div className="intro-stage-picker" role="group" aria-label="연습 과정 살펴보기">{stages.map((stage, index) => <button key={stage.label} type="button" aria-pressed={active === index} onClick={() => setActive(index)}><span>0{index + 1}</span>{stage.label}</button>)}</div>
            <div className="intro-stage-description"><span className="intro-eyebrow">0{active + 1}단계</span><h3>{stages[active].title}</h3><p>{stages[active].text}</p></div>
            <Button type="button" variant="outline" onClick={onNext}>연습할 상황 적기 <ArrowRight size={16} aria-hidden="true" /></Button>
          </div>
          <Card className="intro-example" aria-label="연습 과정 설명 예시">
            <div className="intro-example-header"><span><ChatDots size={16} aria-hidden="true" />{example.setting}</span><Badge variant="outline">연습 예시</Badge></div>
            <CardContent>
              {active === 0 && <><span className="intro-example-label">이렇게 적어보세요</span><p className="intro-example-main">{example.prompt}</p><div className="intro-context"><span>상황</span><span>상대</span><span>원하는 목표</span></div><p className="intro-example-note">입력한 상황에 맞춰 AI가 대화를 만들어요.</p></>}
              {active === 1 && <><span className="intro-example-label">대화 상대 · {example.persona}</span><p className="intro-example-main">“{example.question}”</p><div className="intro-example-answer"><span>내 답변</span><p>{example.answer}</p></div><p className="intro-example-note">내 답변을 바탕으로 다음 대화가 이어져요.</p></>}
              {active === 2 && <><span className="intro-example-label">다시 연습할 점</span><p className="intro-example-main">{example.feedback}</p><div className="intro-example-answer"><span>다시 말해볼 때</span><p>{example.detail}</p></div><p className="intro-example-note">설명을 위한 예시예요. 실제 분석 결과는 아니에요.</p></>}
            </CardContent>
          </Card>
        </div>
      </section>
      <section className="intro-analysis" id={`${mode}-analysis`} aria-labelledby={`${mode}-fit-title`}>
        <FitAnalysisPages mode={mode} stageBackground={<FitGridBackground />} />
      </section>
    </div>
  );
}
