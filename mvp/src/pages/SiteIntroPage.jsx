import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Button, Card, CardContent } from "../components/ui/shadcn";
import { homeFitSnapshot } from "../data/homeContent";

export function SiteIntroPage({ onPractice }) {
  return (
    <section className="page public-page site-intro-page">
      <header className="public-hero public-hero--compact">
        <p className="public-eyebrow">MIRROR-TING / 서비스 소개</p>
        <h1>중요한 대화 전에,<br />먼저 연습해요.</h1>
        <p>Mirror-Ting에서는 AI와 대화를 미리 연습할 수 있어요. 답변·목소리·표정·자세를 함께 살펴보고, 다음 대화에서 바꿀 한 가지를 찾아요.</p>
        <Button size="lg" type="button" onClick={onPractice}>연습할 상황 적기 <ArrowRight size={18} /></Button>
      </header>

      <section className="public-section" aria-labelledby="intro-fit-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">4-Fit 피드백</p>
          <h2 id="intro-fit-title">내 말과 행동을 돌아봐요</h2>
          <p>답변, 목소리, 표정, 자세에서 바꾸고 싶은 점을 찾아봐요.</p>
        </div>
        <div className="public-card-grid public-card-grid--four">
          {homeFitSnapshot.map((fit) => (
            <Card className="public-feature-card public-feature-card--fit" key={fit.label}>
              <CardContent>
                <img className="public-fit-image" src={fit.image} alt="" width="72" height="72" loading="lazy" />
                <h3>{fit.short === "응답" ? "답변" : fit.short}</h3>
                <p>{fit.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </section>
  );
}
