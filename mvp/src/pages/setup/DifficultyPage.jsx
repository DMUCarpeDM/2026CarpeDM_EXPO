import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, difficulties, setupScenarioServer, setupSteps } from "../../data/setupCatalog";

export function DifficultyPage({ scenarios, selectedScenarioId, onScenario, counterpartProfile, difficulty, onPrev, onNext }) {
  const selectedScenario = scenarios.find((item) => item.id === selectedScenarioId) || scenarios[0];
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1];
  const selectedDifficulty = difficulties.find((item) => item.id === difficulty) || difficulties[0];

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={1} />
          <PageTitle eyebrow="상황 선택" title="어떤 상황을 연습할까요?" subtitle="대화의 목적에 맞는 실제 업무 상황을 골라 주세요." />
          <ChoiceSection image={setupScenarioServer} title="연습 상황 선택" description="선택한 상대 역할에 맞는 업무 상황을 골라요." columns="four" className="scenario-choice-section">
            {scenarios.map((item) => <ChoiceCard key={item.id} {...item} tone="blue" variant="scenario-catalog" selected={selectedScenarioId === item.id} onClick={() => onScenario(item.id)} />)}
          </ChoiceSection>
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} />
        </div>
        <SetupSelectionSummary counterpart={profile} difficulty={selectedDifficulty} scenario={selectedScenario} modeLabel="다음 단계에서 선택" tip="업무에서 자주 마주치는 장면을 고르면 다음 연습에 바로 연결할 수 있어요." />
      </div>
    </SetupMotionPage>
  );
}
