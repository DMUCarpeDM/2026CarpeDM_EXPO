import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, difficulties, getEpisodeImage, setupSteps } from "../../data/setupCatalog";
import { resolveServiceMode } from "../../lib/serviceModeContext";

export function DifficultyPage({ serviceMode, counterpartProfile, scenario, selectedEpisode, difficulty, onDifficulty, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[0];
  const resolvedServiceMode = resolveServiceMode(serviceMode?.id);
  const selectedDifficulty = difficulties.find((item) => item.id === difficulty) || difficulties[0];

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={2} />
          <PageTitle eyebrow={`${resolvedServiceMode.label} · 난이도 선택`} title="어느 정도로 연습할까요?" subtitle={resolvedServiceMode.setupDescription} />
          <ChoiceSection icon="normal" title="난이도 선택" description={`이 모드에서 만날 대화의 복잡도와 질문 강도를 선택해 주세요.`} columns="three" className="difficulty-choice-section">
            {difficulties.map((item) => <ChoiceCard key={item.id} {...item} variant="difficulty" selected={difficulty === item.id} onClick={() => onDifficulty(item.id)} />)}
          </ChoiceSection>
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} />
        </div>
        <SetupSelectionSummary counterpart={profile} scenario={selectedEpisode || scenario} scenarioImage={getEpisodeImage(scenario?.slug, selectedEpisode?.id)} difficulty={selectedDifficulty} modeLabel="약 5분" tip={`${resolvedServiceMode.label}: ${resolvedServiceMode.detail}`} />
      </div>
    </SetupMotionPage>
  );
}
