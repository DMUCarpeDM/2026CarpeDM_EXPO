import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, setupSteps } from "../../data/setupCatalog";

export function RoleSelectPage({ counterpartProfile, onCounterpart, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1];

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={0} />
          <PageTitle eyebrow="상대 역할 선택" title="누구와 대화할까요?" subtitle="연습할 대화 상대를 먼저 골라요." />
          <ChoiceSection icon="role" title="상대 역할 선택" description="대화할 상대방의 역할을 선택해 주세요." columns="four" className="role-choice-section">
            {counterpartProfiles.map((item) => (
              <ChoiceCard key={item.id} {...item} variant="portrait" selected={counterpartProfile === item.id} onClick={() => onCounterpart(item.id)} />
            ))}
          </ChoiceSection>
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} />
        </div>
        <SetupSelectionSummary counterpart={profile} modeLabel="다음 단계에서 선택" tip="대화 상대를 고르면 상황에 더 집중하기 쉬워요." />
      </div>
    </SetupMotionPage>
  );
}
