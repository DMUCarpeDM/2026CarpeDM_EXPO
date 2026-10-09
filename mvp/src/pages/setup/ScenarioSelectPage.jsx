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
import { Button } from "../../components/ui/shadcn";
import { InterviewProgress } from "../../components/setup/InterviewProgress";

export function ScenarioSelectPage({ serviceMode, counterpartProfile, scenarios, status = "ready", onRetry, selectedEpisodeId, onScenario, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[0];
  const resolvedServiceMode = resolveServiceMode(serviceMode?.id);
  const scenarioOptions = getRoleScenarioOptions(scenarios, counterpartProfile);
  const selectedScenario = scenarioOptions.find((item) => item.episodeId === selectedEpisodeId);
  const focused = resolvedServiceMode.id === "interview";

  return (
    <SetupMotionPage className={focused ? "interview-focus" : ""}>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          {focused ? <InterviewProgress active={1} /> : <MiniStepper items={setupSteps} active={1} />}
          <PageTitle eyebrow={focused ? undefined : `${resolvedServiceMode.label} · 시나리오 선택`} title="어떤 상황을 연습할까요?" subtitle={resolvedServiceMode.scenarioDescription} />
          <ChoiceSection quiet={focused} icon="briefcase" title="연습 시나리오 선택" description={resolvedServiceMode.detail} columns={scenarioOptions.length === 1 ? "one" : "two"} className="scenario-choice-section">
            {scenarioOptions.map((item) => <ChoiceCard key={item.id} image={getEpisodeImage(item.scenarioSlug, item.episodeId)} title={item.title} text={item.description} detail={`${item.character?.name || "AI 상대"} · ${item.character?.role || "업무 대화"}`} variant="scenario-catalog" selected={selectedEpisodeId === item.episodeId} onClick={() => onScenario(item)} />)}
            {!scenarioOptions.length && (
              <div className="scenario-empty" role="status" aria-live="polite" aria-busy={status === "loading"}>
                {status === "loading" ? <p>연습 시나리오를 불러오고 있어요.</p> : status === "error" ? <>
                  <p>시나리오를 불러오지 못했어요. 연결이 복구되면 자동으로 다시 확인해요.</p>
                  <Button type="button" variant="outline" onClick={onRetry}>지금 다시 시도</Button>
                </> : <p>{resolvedServiceMode.emptyScenarioMessage}</p>}
              </div>
            )}
          </ChoiceSection>
          {focused ? <p className="interview-selection" role="status">{profile.title} · {selectedScenario?.title || "시나리오를 선택해 주세요."}</p> : <SetupSelectionSummary counterpart={profile} scenario={selectedScenario} scenarioImage={getEpisodeImage(selectedScenario?.scenarioSlug, selectedScenario?.episodeId)} modeLabel="다음 단계에서 선택" tip={resolvedServiceMode.detail} />}
          <SetupFlowActions onPrev={onPrev} label="다음 단계로" onNext={onNext} nextDisabled={!selectedScenario} />
        </div>
      </div>
    </SetupMotionPage>
  );
}
