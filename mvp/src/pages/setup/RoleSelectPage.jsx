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
import { InterviewProgress } from "../../components/setup/InterviewProgress";

export function RoleSelectPage({ serviceMode, counterpartProfile, onCounterpart, onPrev, onNext }) {
  const resolvedServiceMode = resolveServiceMode(serviceMode?.id);
  const profiles = profilesForMode(resolvedServiceMode.id);
  const profile = profiles.find((item) => item.id === counterpartProfile);
  const focused = resolvedServiceMode.id === "interview";

  return (
    <SetupMotionPage className={focused ? "interview-focus" : ""}>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          {focused ? <InterviewProgress active={0} /> : <MiniStepper items={setupSteps} active={0} />}
          <PageTitle eyebrow={focused ? undefined : resolvedServiceMode.label} title={focused ? "어떤 직무를 준비하고 있나요?" : resolvedServiceMode.setupTitle} subtitle={resolvedServiceMode.setupDescription} />
          <ChoiceSection quiet={focused} icon="role" title="직무 선택" description={resolvedServiceMode.detail} columns="three" className="role-choice-section">
            {profiles.map((item) => (
              <ChoiceCard key={item.id} {...item} variant="portrait" selected={counterpartProfile === item.id} onClick={() => onCounterpart(item.id)} />
            ))}
          </ChoiceSection>
          {focused ? <p className="interview-selection" role="status">{profile ? `${profile.title} 선택됨` : "연습할 직무를 하나 선택해 주세요."}</p> : <SetupSelectionSummary counterpart={profile} modeLabel="다음 단계에서 선택" tip={resolvedServiceMode.setupDescription} />}
          <SetupFlowActions onPrev={onPrev} label={profile ? "다음 단계로" : "직무를 선택해 주세요"} onNext={onNext} nextDisabled={!profile} />
        </div>
      </div>
    </SetupMotionPage>
  );
}
