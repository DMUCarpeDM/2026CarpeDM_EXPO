import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, difficulties, getScenarioImage, setupSteps } from "../../data/setupCatalog";

export function DifficultyPage({ counterpartProfile, scenario, difficulty, onDifficulty, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1];
  const selectedDifficulty = difficulties.find((item) => item.id === difficulty) || difficulties[0];

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={2} />
          <PageTitle eyebrow="난이도 선택" title="어느 정도로 연습할까요?" subtitle="편안하게 시작하거나, 추가 질문까지 도전할 수 있어요." />
          <ChoiceSection icon="normal" title="난이도 선택" description="대화의 복잡도와 질문 강도를 선택해 주세요." columns="three" className="difficulty-choice-section">
            {difficulties.map((item) => <ChoiceCard key={item.id} {...item} variant="difficulty" selected={difficulty === item.id} onClick={() => onDifficulty(item.id)} />)}
          </ChoiceSection>
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} />
        </div>
        <SetupSelectionSummary counterpart={profile} scenario={scenario} scenarioImage={getScenarioImage(scenario?.slug)} difficulty={selectedDifficulty} modeLabel="약 5분" tip="처음이라면 기본 모드로 대화 흐름부터 익혀 보세요." />
      </div>
    </SetupMotionPage>
  );
}
