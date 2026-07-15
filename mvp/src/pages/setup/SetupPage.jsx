import { Target } from "reicon-react/icons/Target";
import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  Panel,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, setupGoalPrep, setupSteps } from "../../data/setupCatalog";

export function SetupPage({ scenario, goals, goal, onGoal, counterpartProfile, difficulty, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1];

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={2} />
          <PageTitle eyebrow="목표 선택" title="이번 연습의 목표를 정해요" subtitle="지금 필요한 연습 방식 하나를 선택해 시작해요." />
          <ChoiceSection image={setupGoalPrep} title="연습 목표 선택" description="선택한 상황에서 가장 먼저 연습할 대화 방식을 정해요." columns="five" className="goal-choice-section">
            {goals.map((item) => <ChoiceCard key={item.id} {...item} variant="goal-catalog" selected={goal?.id === item.id} onClick={() => onGoal(item.id)} />)}
          </ChoiceSection>
          <Panel className="setup-ready-card">
            <Target size={23} />
            <div>
              <strong>{scenario?.title || "선택한 상황을 불러오고 있어요"}</strong>
              <p>{scenario?.text || "선택한 상황의 세부 내용을 준비하고 있어요."}</p>
            </div>
          </Panel>
          <SetupFlowActions onPrev={onPrev} label="상황 미리보기" onNext={onNext} />
        </div>
        <SetupSelectionSummary counterpart={profile} difficulty={difficulty} scenario={scenario} goal={goal} modeLabel={`약 ${goal?.mode || 5}분`} tip="목표를 하나만 정하면 연습을 마친 뒤 다음에 바꿔볼 점도 더 선명해져요." />
      </div>
    </SetupMotionPage>
  );
}
