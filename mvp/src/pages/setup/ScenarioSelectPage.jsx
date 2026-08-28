import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, getEpisodeImage, getRoleScenarioOptions, setupSteps } from "../../data/setupCatalog";
import { resolveServiceMode } from "../../lib/serviceModeContext";

export function ScenarioSelectPage({ serviceMode, counterpartProfile, scenarios, selectedEpisodeId, onScenario, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[0];
  const resolvedServiceMode = resolveServiceMode(serviceMode?.id);
  const scenarioOptions = getRoleScenarioOptions(scenarios, counterpartProfile);
  const selectedScenario = scenarioOptions.find((item) => item.episodeId === selectedEpisodeId);

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={1} />
          <PageTitle eyebrow={`${resolvedServiceMode.label} · 시나리오 선택`} title="어떤 상황을 연습할까요?" subtitle={resolvedServiceMode.scenarioDescription} />
          <ChoiceSection icon="briefcase" title="연습 시나리오 선택" description={resolvedServiceMode.detail} columns={scenarioOptions.length === 1 ? "one" : "two"} className="scenario-choice-section">
            {scenarioOptions.map((item) => <ChoiceCard key={item.id} image={getEpisodeImage(item.scenarioSlug, item.episodeId)} title={item.title} text={item.description} detail={`${item.character?.name || "AI 상대"} · ${item.character?.role || "업무 대화"}`} variant="scenario-catalog" selected={selectedEpisodeId === item.episodeId} onClick={() => onScenario(item)} />)}
            {!scenarioOptions.length && (
              <p className="scenario-empty">
                {scenarios.length === 0
                  ? `${resolvedServiceMode.emptyScenarioMessage} 분석 서버(8001) 연결을 확인해 주세요 — 서버가 켜지면 자동으로 다시 불러와요.`
                  : resolvedServiceMode.emptyScenarioMessage}
              </p>
            )}
          </ChoiceSection>
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} nextDisabled={!selectedScenario} />
        </div>
        <SetupSelectionSummary counterpart={profile} scenario={selectedScenario} scenarioImage={getEpisodeImage(selectedScenario?.scenarioSlug, selectedScenario?.episodeId)} modeLabel="다음 단계에서 선택" tip={resolvedServiceMode.detail} />
      </div>
    </SetupMotionPage>
  );
}
