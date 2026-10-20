import { Button } from "../ui/shadcn";

export function PromptPreflight({ prompt, serviceMode, difficulty, consented, onConsent, starting, onNext, onPrev, error }) {
  const difficultyLabel = { basic: "기본", pressure: "심화", ultra_pressure: "압박" }[difficulty?.id] || "기본";
  return <section className="page preflight-preview prompt-preflight" aria-labelledby="prompt-ready-title">
    <header className="preview-heading"><div><h1 id="prompt-ready-title">연습할 내용을 확인해요</h1><span>시작하면 AI가 대화 상대와 첫 질문을 만들어요.</span></div></header>
    <section className="interview-ready-summary"><h2>내가 적은 상황</h2><p className="prompt-scenario-summary">{prompt}</p><p>{serviceMode.label} · {difficultyLabel}</p></section>
    <p>연습을 시작하면 AI가 내 답변에 맞춰 다음 질문을 해요.</p>
    <div className="preview-start-area">
      <label className="consent-check"><input type="checkbox" checked={consented} disabled={starting} onChange={event => onConsent(event.target.checked)} /><span>입력한 상황과 대화 내용을 AI 제공자에게 보내는 데 동의해요. 카메라·음성 분석과 서버에서의 연습 기록 처리에도 동의해요. AI 음성을 만들 때 외부 음성 서비스를 이용할 수 있어요.</span></label>
      {error && <p className="preview-error" role="alert">{error}</p>}
      <div className="setup-flow-actions"><Button type="button" variant="outline" disabled={starting} onClick={onPrev}>난이도 다시 고르기</Button><Button type="button" disabled={!consented || starting} onClick={onNext}>{starting ? "AI가 연습할 대화를 만들고 있어요" : "동의하고 연습 시작하기"}</Button></div>
    </div>
  </section>;
}
