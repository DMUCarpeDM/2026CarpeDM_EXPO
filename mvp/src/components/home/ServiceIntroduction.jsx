import { LineEffects } from "../backgrounds/LineEffects";
import { IntroScrollStory } from "./IntroScrollStory";
import { FitGridBackground } from "./FitGridBackground";
import { FitAnalysisPages } from "./FitAnalysisPages";
import "../../styles/service-introduction.css";

const examples = {
  interview: { prompt: "신입 개발자 면접에서 프로젝트 경험을 설명하고 추가 질문에 답하고 싶어요.", setting: "신입 개발자 · 실무 면접", persona: "면접관", question: "프로젝트에서 가장 어려웠던 문제는 무엇인가요? 어떻게 해결했는지도 알려주세요.", answer: "배포가 늦어졌을 때 작업의 우선순위를 다시 정했습니다.", feedback: "내가 한 행동 뒤에, 그 결과를 한 문장 덧붙여보세요.", detail: "문제 → 나의 행동 → 결과 순서로 말하면 경험이 더 또렷하게 전달돼요." },
  workplace: { prompt: "팀장에게 일정이 늦어진 이유를 설명하고 먼저 할 일을 정하고 싶어요.", setting: "일정 조율 · 팀장과의 대화", persona: "팀장", question: "이번 주 안에 마치려면 어떤 조정이 필요할까요?", answer: "검증 시간이 더 필요해서, 먼저 완료할 범위를 함께 정하고 싶습니다.", feedback: "상대와 함께 정할 일을 구체적으로 말해보세요.", detail: "현재 상황을 설명하고, 가능한 방법과 함께 정할 일을 말해보세요." },
};

export function ServiceIntroduction({ mode }) {
  const example = examples[mode] || examples.workplace;
  return (
    <div className="service-introduction">
      <IntroScrollStory mode={mode} example={example} background={<div className="intro-story-lines" aria-hidden="true"><LineEffects /></div>} />
      <section className="intro-analysis" id={`${mode}-analysis`} aria-labelledby={`${mode}-fit-title`}>
        <FitAnalysisPages mode={mode} stageBackground={<FitGridBackground />} />
      </section>
    </div>
  );
}
