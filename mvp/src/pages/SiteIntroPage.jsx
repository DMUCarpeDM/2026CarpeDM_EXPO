import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Button, Card, CardContent } from "../components/ui/shadcn";
import { IconGlyph } from "../components/ui/IconGlyph";
import { serviceModes } from "../data/setupCatalog";
import { homeFitSnapshot } from "../data/homeContent";

export function SiteIntroPage({ onPractice }) {
  return (
    <section className="page public-page site-intro-page">
      <header className="public-hero public-hero--compact">
        <p className="public-eyebrow">Service intro</p>
        <h1>중요한 대화 전에,<br />먼저 연습해요.</h1>
        <p>Mirror-Ting은 면접·직업훈련·직장대화를 연습하는 AI 코칭 서비스예요. 응답·목소리·표정·자세를 함께 살펴보고, 다음 대화에서 바꿀 한 가지를 찾아요.</p>
        <Button size="lg" type="button" onClick={onPractice}>연습 홈으로 가기 <ArrowRight size={18} /></Button>
      </header>

      <section className="public-section" aria-labelledby="intro-mode-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">Practice modes</p>
          <h2 id="intro-mode-title">현재 준비된 연습 모드</h2>
        </div>
        <div className="public-card-grid public-card-grid--three">
          {serviceModes.map((mode) => (
            <Card className="public-feature-card" key={mode.id}>
              <CardContent>
                <span className={`public-icon public-icon--${mode.tone}`}><IconGlyph icon={mode.icon} size={28} /></span>
                <h3>{mode.label}</h3>
                <p>{mode.description}</p>
                <small>{mode.detail}</small>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="public-section" aria-labelledby="intro-fit-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">4-Fit</p>
          <h2 id="intro-fit-title">결과 리포트가 보는 네 가지 축</h2>
          <p>응답, 목소리, 표정, 자세를 살펴보고 다음 연습에서 보완할 점을 확인해요.</p>
        </div>
        <div className="public-card-grid public-card-grid--four">
          {homeFitSnapshot.map((fit) => (
            <Card className="public-feature-card public-feature-card--fit" key={fit.label}>
              <CardContent>
                <img className="public-fit-image" src={fit.image} alt="" width="72" height="72" loading="lazy" />
                <h3>{fit.short}</h3>
                <p>{fit.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </section>
  );
}
