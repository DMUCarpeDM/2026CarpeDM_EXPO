import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, getRoleScenarioOptions, getScenarioImage, setupSteps } from "../../data/setupCatalog";

export function ScenarioSelectPage({ counterpartProfile, scenarios, selectedEpisodeId, onScenario, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[1];
  const scenarioOptions = getRoleScenarioOptions(scenarios, counterpartProfile);
  const selectedScenario = scenarioOptions.find((item) => item.episodeId === selectedEpisodeId);

  return (
    <SetupMotionPage>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          <MiniStepper items={setupSteps} active={1} />
          <PageTitle eyebrow="시나리오 선택" title="어떤 상황을 연습할까요?" subtitle="선택한 상대 역할에 등록된 실제 업무 장면만 보여 드려요." />
          <ChoiceSection icon="briefcase" title="연습 시나리오 선택" description="선택한 장면의 질문과 피드백으로 역할극을 진행해요." columns={scenarioOptions.length === 1 ? "one" : "two"} className="scenario-choice-section">
            {scenarioOptions.map((item) => <ChoiceCard key={item.id} image={getScenarioImage(item.scenarioSlug)} title={item.title} text={item.description} detail={`${item.character?.name || "AI 상대"} · ${item.character?.role || "업무 대화"}`} variant="scenario-catalog" selected={selectedEpisodeId === item.episodeId} onClick={() => onScenario(item)} />)}
            {!scenarioOptions.length && (
              <p className="scenario-empty">
                {scenarios.length === 0
                  ? "분석 서버(8001) 연결을 확인해 주세요 — 서버가 켜지면 자동으로 다시 불러와요."
                  : `현재 백엔드에 등록된 ${profile.title} 장면이 없어요. 다른 역할을 선택해 주세요.`}
              </p>
            )}
          </ChoiceSection>
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} nextDisabled={!selectedScenario} />
        </div>
        <SetupSelectionSummary counterpart={profile} scenario={selectedScenario} scenarioImage={getScenarioImage(selectedScenario?.scenarioSlug)} modeLabel="다음 단계에서 선택" tip="장면을 고르면 실제 서버의 질문 흐름으로 연습을 시작해요." />
      </div>
    </SetupMotionPage>
  );
}
