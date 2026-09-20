import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { profilesForMode, setupSteps } from "../../data/setupCatalog";
import { resolveServiceMode } from "../../lib/serviceModeContext";

export function RoleSelectPage({ serviceMode, counterpartProfile, onCounterpart, onPrev, onNext }) {
  const resolvedServiceMode = resolveServiceMode(serviceMode?.id);
  const profiles = profilesForMode(resolvedServiceMode.id);
  const profile = profiles.find((item) => item.id === counterpartProfile) || profiles[0];

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={0} />
          <PageTitle eyebrow={resolvedServiceMode.label} title={resolvedServiceMode.setupTitle} subtitle={resolvedServiceMode.setupDescription} />
          <ChoiceSection icon="role" title="직무 선택" description={resolvedServiceMode.detail} columns="three" className="role-choice-section">
            {profiles.map((item) => (
              <ChoiceCard key={item.id} {...item} variant="portrait" selected={counterpartProfile === item.id} onClick={() => onCounterpart(item.id)} />
            ))}
          </ChoiceSection>
          <SetupSelectionSummary counterpart={profile} modeLabel="다음 단계에서 선택" tip={resolvedServiceMode.setupDescription} />
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} />
        </div>
      </div>
    </SetupMotionPage>
  );
}
