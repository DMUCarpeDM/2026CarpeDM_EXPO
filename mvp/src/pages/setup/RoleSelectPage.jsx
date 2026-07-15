import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, difficulties, setupSteps } from "../../data/setupCatalog";

export function RoleSelectPage({ scenario, counterpart, counterpartProfile, onCounterpart, onCounterpartProfile, difficulty, onDifficulty, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1];
  const selectedDifficulty = difficulties.find((item) => item.id === difficulty) || difficulties[0];
  const characters = scenario?.characters || [];

  const chooseCounterpart = (item, index) => {
    onCounterpartProfile(item.id);
    onCounterpart(characters[index % Math.max(characters.length, 1)]?.id || counterpart);
  };

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={0} />
          <PageTitle eyebrow="기본 설정" title="역할을 선택하세요" subtitle="AI가 선택한 역할로 실제 업무 상황을 함께 연습해요." />
          <ChoiceSection icon="role" title="상대 역할 선택" description="대화할 상대방의 역할을 선택해 주세요." columns="four" className="role-choice-section">
            {counterpartProfiles.map((item, index) => (
              <ChoiceCard key={item.id} {...item} variant="portrait" selected={counterpartProfile === item.id} onClick={() => chooseCounterpart(item, index)} />
            ))}
          </ChoiceSection>
          <ChoiceSection icon="normal" title="난이도 선택" description="상황의 복잡도와 압박 정도를 선택해 주세요." columns="two" className="difficulty-choice-section">
            {difficulties.map((item) => <ChoiceCard key={item.id} {...item} variant="difficulty" selected={difficulty === item.id} onClick={() => onDifficulty(item.id)} />)}
          </ChoiceSection>
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} />
        </div>
        <SetupSelectionSummary counterpart={profile} difficulty={selectedDifficulty} scenario={scenario} modeLabel="다음 단계에서 선택" tip="실제 업무 상황을 떠올리고 선택하면 더 자연스럽게 연습할 수 있어요." />
      </div>
    </SetupMotionPage>
  );
}
