import { useEffect, useRef, useState } from "react";
import { homeFitSnapshot } from "../../data/homeContent";

const details = [
  { name: "Response-Fit", title: "맥락에 맞게 답했는지 확인해요.", description: "맥락과 목표에 맞는 답인지 봐요.", points: ["질문에 맞는 응답", "핵심과 근거의 연결", "상황에 맞는 표현"], tip: "결론을 먼저 말하고, 구체적인 경험이나 이유를 한 가지 덧붙여보세요." },
  { name: "Voice-Fit", title: "상황에 맞는 목소리인지 확인해요.", description: "장면에 맞는 속도와 음량을 봐요.", points: ["말하는 속도", "목소리의 크기", "말 사이의 멈춤"], tip: "중요한 내용을 말하기 전 잠깐 쉬고, 한 문장씩 또렷하게 전달해보세요." },
  { name: "Expression-Fit", title: "장면에 맞는 표정인지 확인해요.", description: "표정의 변화를 대화와 함께 봐요.", points: ["대화 중 표정 변화", "관찰 가능한 얼굴 신호", "표정 분석 표본"], tip: "표정만으로 감정이나 의도를 단정하지 않고, 대화 내용과 함께 돌아보세요." },
  { name: "Posture-Fit", title: "상황에 맞는 자세인지 확인해요.", description: "몸의 움직임을 상황과 함께 봐요.", points: ["몸의 기울어짐", "머리와 상체의 움직임", "반복되는 자세 습관"], tip: "어깨의 힘을 빼고 편안하게 앉아, 말을 마칠 때까지 자세를 유지해보세요." },
];

export function FitAnalysisPages({ mode }) {
  const [page, setPage] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const container = useRef(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const node = container.current;
      if (!node) return;
      const { top, height } = node.getBoundingClientRect();
      const stage = node.firstElementChild;
      const inset = parseFloat(window.getComputedStyle(stage).top) || 0;
      const distance = height - stage.getBoundingClientRect().height;
      const progress = Math.max(0, Math.min(1, (inset - top) / Math.max(1, distance)));
      setPage(Math.min(4, Math.floor(progress * 5)));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const syncPreference = () => { setReducedMotion(preference.matches); schedule(); };
    syncPreference();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    preference.addEventListener("change", syncPreference);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      preference.removeEventListener("change", syncPreference);
    };
  }, []);

  return (
    <div className="fit-scroll" ref={container} data-active-fit={page - 1}>
      <div className="fit-scroll-stage">
        <div className={`fit-scroll-panel fit-scroll-title${page === 0 ? " is-active" : ""}`} aria-hidden={!reducedMotion && page !== 0}>
          <span className="intro-eyebrow">4-Fit 피드백</span>
          <h2 id={`${mode}-fit-title`}>대화의 맥락에 맞는<br />말과 태도를 살펴봐요.</h2>
        </div>
        {homeFitSnapshot.map((fit, index) => <article key={fit.tone} className={`fit-scroll-panel${page === index + 1 ? " is-active" : ""}`} aria-hidden={!reducedMotion && page !== index + 1} aria-labelledby={`${mode}-fit-heading-${index}`}>
          <div className="fit-scroll-visual"><img src={fit.image} alt="" width="176" height="176" /></div>
          <div className="fit-scroll-copy"><span className="intro-eyebrow">{details[index].name}</span><h3 id={`${mode}-fit-heading-${index}`}>{details[index].title}</h3><p>{details[index].description}</p></div>
        </article>)}
      </div>
    </div>
  );
}
