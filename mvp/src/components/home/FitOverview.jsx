import { homeFitSnapshot } from "../../data/homeContent";
import "../../styles/fit-overview.css";

const descriptions = {
  response: "질문에 맞는 답변인지, 핵심과 근거가 잘 연결되는지 살펴봐요.",
  voice: "말하는 속도와 음량 등 목소리의 전달 방식을 살펴봐요.",
  expression: "대화 중 드러나는 표정의 변화를 살펴봐요.",
  posture: "몸의 움직임과 자세가 얼마나 안정적인지 살펴봐요.",
};

export function FitOverview() {
  return <div className="home-fit-overview" aria-label="4-Fit 분석 항목 안내">
    {homeFitSnapshot.map(fit => <article className="home-fit-overview__item" key={fit.tone}>
      <img src={fit.image} alt="" width="80" height="80" loading="lazy" />
      <h3>{fit.short}</h3>
      <p>{descriptions[fit.tone]}</p>
    </article>)}
  </div>;
}
