import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "reicon-react/icons/ArrowLeft";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Button } from "../ui/shadcn";
import officeMap from "../../assets/workplace-office-map.png";
import "../../styles/workplace-journey.css";

// 시간과 대사는 흐름을 이해하기 위한 예시임. 선택해도 실제 시작 단계는 바뀌지 않음.
const scenes = [
  { time: "09:00", name: "출근", person: "박선임", title: "첫 부탁을 받았어요.", line: "지금 이 일 좀 먼저 봐줄 수 있어요?", tip: "부탁받은 내용과 가능한 시간을 이야기해요." },
  { time: "14:00", name: "업무", person: "김팀장", title: "진행 상황을 공유해요.", line: "진행 상황이랑 다음 일정 알려주세요.", tip: "완료한 일과 남은 일을 차례로 이야기해요." },
  { time: "18:00", name: "퇴근", person: "이동료", title: "내일의 일을 정리해요.", line: "내일 이어서 할 일은 정리됐나요?", tip: "남은 일과 다음 할 일을 확인하고 마무리해요." },
];
const permissionLabel = (state) => state === "granted" ? "권한 허용됨" : state === "denied" ? "권한 차단됨" : "시작 시 확인";

export function WorkplacePreflight({ mode, aiReady, permissionState, consented, onConsent, starting, onNext, error }) {
  const [current, setCurrent] = useState(0);
  const [animateNavigation, setAnimateNavigation] = useState(false);
  const sceneContent = useRef(null);
  const sceneFade = useRef(null);
  const scene = scenes[current];

  useEffect(() => () => sceneFade.current?.cancel(), []);

  const selectScene = (event, index) => {
    if (index === current) return;
    // 키보드 선택은 즉시 반영하고, 연속 클릭은 진행 중인 투명도에서 이어감.
    const pointer = event.detail > 0;
    const opacity = sceneFade.current?.playState === "running" ? getComputedStyle(sceneContent.current).opacity : 0.65;
    sceneFade.current?.cancel();
    setAnimateNavigation(pointer);
    setCurrent(index);
    if (pointer) sceneFade.current = sceneContent.current.animate([{ opacity }, { opacity: 1 }], {
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 180,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  };

  return <section className="page preview-page workplace-journey" data-animate={animateNavigation} aria-labelledby="workplace-preview-title">
    <header className="workplace-journey-heading">
      <p>직장 커뮤니케이션 · 약 {mode}분</p>
      <h1 id="workplace-preview-title">회사에서 보내는 <em>하루.</em></h1>
      <span>출근부터 퇴근까지, 장면을 따라 대화해요.</span>
    </header>
    <div className="workplace-journey-body">
      <div className="workplace-journey-map">
        <img src={officeMap} width="1448" height="1086" alt="로비, 업무 공간, 출구가 이어지는 회사 입체 지도" />
        {scenes.map((item, index) => <button key={item.name} type="button" className={`workplace-journey-pin pin-${index}`} aria-pressed={current === index} aria-label={`${item.name} 공간 미리보기`} onClick={(event) => selectScene(event, index)}><b>{item.time}</b><span>{item.name}</span></button>)}
      </div>
      <aside className="workplace-journey-context">
        <div ref={sceneContent} aria-live="polite" aria-atomic="true">
          <span className="workplace-journey-stamp">0{current + 1} · {scene.name} 미리보기</span>
          <h2>{scene.title}</h2>
          <div className="workplace-journey-quote"><span>{scene.person}</span><p>“{scene.line}”</p></div>
          <p className="workplace-journey-tip">{scene.tip}</p>
        </div>
        <label className="workplace-journey-consent"><input type="checkbox" checked={consented} disabled={starting} onChange={(event) => onConsent(event.target.checked)} /><span>카메라·음성 분석에 동의해요.</span></label>
        <Button type="button" size="lg" className="workplace-journey-start" disabled={!consented || starting} onClick={onNext}>{starting ? "연습을 준비하고 있어요" : "출근부터 시작하기"}<ArrowRight size={20} aria-hidden="true" /></Button>
        <details className="workplace-journey-details"><summary>분석 및 저장 안내 · 준비 상태</summary><p>AI 상대 음성은 외부 음성 서비스로 만들 수 있어요. 연습 음성과 분석 결과는 이 브라우저에 보관되며, 서버의 세션·기록 처리도 이루어져요.</p><ul><li>대화 AI: {aiReady ? "준비됨" : "실행 필요"}</li><li>마이크: {permissionLabel(permissionState.microphone)}</li><li>카메라: {permissionLabel(permissionState.camera)}</li></ul><p>카메라와 마이크는 시작할 때 확인해요.</p></details>
        {error && <p className="preview-error" role="alert">{error}</p>}
        <p className="workplace-journey-policy">미리보기는 자유롭게 · 연습은 순서대로<br /><small>위 시각과 대사는 예시이며, 실제 상황은 연습에서 안내해요.</small></p>
      </aside>
    </div>
    <nav className="workplace-journey-nav" aria-label="시간대 미리보기">
      <button type="button" className="workplace-journey-arrow" aria-label="이전 장면" disabled={current === 0} onClick={(event) => selectScene(event, current - 1)}><ArrowLeft size={22} aria-hidden="true" /></button>
      <div className="workplace-journey-stops">
        <span className="workplace-journey-indicator" aria-hidden="true" data-animate={animateNavigation} style={{ transform: `translateX(calc(${current * 100}% + ${current} * var(--journey-stop-gap)))` }} />
        {scenes.map((item, index) => <button type="button" key={item.name} aria-pressed={current === index} onClick={(event) => selectScene(event, index)}><b>{item.time}</b><span>{item.name}</span></button>)}
      </div>
      <button type="button" className="workplace-journey-arrow" aria-label="다음 장면" disabled={current === scenes.length - 1} onClick={(event) => selectScene(event, current + 1)}><ArrowRight size={22} aria-hidden="true" /></button>
    </nav>
  </section>;
}
