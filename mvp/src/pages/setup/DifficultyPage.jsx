import {
  ChoiceCard,
  ChoiceSection,
  MiniStepper,
  PageTitle,
  SetupFlowActions,
  SetupMotionPage,
  SetupSelectionSummary,
} from "../../components/setup/SetupComponents";
import { counterpartProfiles, difficulties, getEpisodeImage, setupSteps, promptSetupSteps } from "../../data/setupCatalog";
import { resolveServiceMode } from "../../lib/serviceModeContext";
import { InterviewProgress } from "../../components/setup/InterviewProgress";

export function DifficultyPage({ serviceMode, counterpartProfile, scenario, selectedEpisode, difficulty, onDifficulty, onPrev, onNext }) {
  const profile = counterpartProfiles.find((item) => item.id === counterpartProfile) || counterpartProfiles[0];
  const resolvedServiceMode = resolveServiceMode(serviceMode?.id);
  const generated = scenario?.world_setting?.source === "user_prompt_pending";
  const generatedDifficulties = difficulties.map((item, index) => ({ ...item, title: ["기본", "심화", "압박"][index], text: ["협력적인 상대와 대화 흐름을 익혀요.", "조건이 맞지 않을 때 이유와 해결 방법을 설명해요.", "까다로운 질문에 내 생각과 해결 방법을 설명해요."][index] }));
  const availableDifficulties = generated ? generatedDifficulties : resolvedServiceMode.id === "interview" && !generated ? [{ ...difficulties[0], title: "일반면접", text: "경력 없는 신입 기준으로 답변해요.", detail: "고정 질문 · 부족한 내용만 추가 질문" }] : difficulties;
  const selectedDifficulty = availableDifficulties.find((item) => item.id === difficulty) || availableDifficulties[0];
  const focused = resolvedServiceMode.id === "interview";

  return (
    <SetupMotionPage className={focused ? "interview-focus" : ""}>
      <div className="selection-layout setup-flow-layout">
        <div className="selection-main setup-flow-main">
          {generated ? <MiniStepper items={promptSetupSteps} active={1} /> : focused ? <InterviewProgress active={2} /> : <MiniStepper items={setupSteps} active={2} />}
          <PageTitle eyebrow={focused ? undefined : `${resolvedServiceMode.label} · 난이도 선택`} title={focused && !generated ? "일반면접으로 시작해볼까요?" : "난이도를 골라주세요"} subtitle={generated ? "난이도에 따라 상대의 질문과 태도가 달라져요." : focused ? "현재는 신입 일반면접을 제공해요. 내 답변에 맞춰 추가 질문을 해요." : resolvedServiceMode.setupDescription} />
          <ChoiceSection quiet={focused} icon="normal" title="난이도 선택" description={resolvedServiceMode.id === "interview" && !generated ? "신입 일반면접으로 진행해요. 답변에 따라 추가 질문이 이어져요." : "얼마나 까다로운 질문을 연습할지 골라주세요."} columns={availableDifficulties.length === 1 ? "one" : "three"} className="difficulty-choice-section">
            {availableDifficulties.map((item) => <ChoiceCard key={item.id} {...item} variant="difficulty" selected={selectedDifficulty.id === item.id} onClick={() => onDifficulty(item.id)} />)}
          </ChoiceSection>
          {generated ? <p className="interview-selection">내가 적은 상황으로 연습 · {selectedDifficulty.title}</p> : focused ? <p className="interview-selection">{profile.title} · {(selectedEpisode || scenario)?.title} · {selectedDifficulty.title}</p> : <SetupSelectionSummary counterpart={profile} scenario={selectedEpisode || scenario} scenarioImage={getEpisodeImage(scenario?.slug, selectedEpisode?.id)} difficulty={selectedDifficulty} modeLabel="약 5분" tip={`${resolvedServiceMode.label}: ${resolvedServiceMode.detail}`} />}
          <SetupFlowActions onPrev={onPrev} label="시작 전 확인하기" onNext={onNext} />
        </div>
      </div>
    </SetupMotionPage>
  );
}
