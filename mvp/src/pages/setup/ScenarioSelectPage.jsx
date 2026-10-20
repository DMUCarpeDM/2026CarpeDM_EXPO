import { MiniStepper, PageTitle, SetupFlowActions, SetupMotionPage } from "../../components/setup/SetupComponents";
import { promptSetupSteps } from "../../data/setupCatalog";
import { resolveServiceMode } from "../../lib/serviceModeContext";

export function ScenarioSelectPage({ serviceMode, prompt = "", onPrompt, onPrev, onNext }) {
  const mode = resolveServiceMode(serviceMode?.id);
  const focused = mode.id === "interview";
  const ready = prompt.trim().length >= 10;
  return <SetupMotionPage className={focused ? "interview-focus" : ""}>
    <div className="selection-layout setup-flow-layout"><div className="selection-main setup-flow-main">
      <MiniStepper items={promptSetupSteps} active={0} />
      <PageTitle title={focused ? "어떤 면접을 준비하고 있나요?" : "연습하고 싶은 상황을 적어주세요"} subtitle="입력한 내용으로 AI가 상황, 상대 인물, 목표와 첫 대사를 새로 만들어요." />
      <label className="prompt-scenario-label" htmlFor="scenario-prompt">{mode.label} 프롬프트</label>
      <textarea className="prompt-scenario-input" id="scenario-prompt" value={prompt} onChange={event => onPrompt(event.target.value)} maxLength={3000} rows={7} placeholder={focused ? "지원 직무, 기업이나 분야, 나의 경험, 연습하고 싶은 면접 분위기를 자유롭게 적어주세요." : "나는 어떤 역할인지, 누구와 어떤 대화를 할지, 원하는 결과와 어려운 점을 자유롭게 적어주세요."} aria-describedby="prompt-scenario-help" />
      <p id="prompt-scenario-help">10~3,000자 · {prompt.length.toLocaleString()}자 입력</p>
      <p>준비된 대본을 선택하지 않아요. 다음 단계에서 난이도와 동의를 확인한 뒤, 시작할 때 시나리오와 첫 대사를 함께 생성해요. 민감한 개인정보는 입력하지 마세요.</p>
      <SetupFlowActions onPrev={onPrev} onNext={onNext} label="난이도 설정하기" nextDisabled={!ready} />
    </div></div>
  </SetupMotionPage>;
}
