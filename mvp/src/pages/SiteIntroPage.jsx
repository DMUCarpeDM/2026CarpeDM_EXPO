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
        <h1>Mirror-Ting은 직장 대화를 연습하는 AI 코칭 서비스입니다</h1>
        <p>실제 업무 상황을 AI 역할극으로 경험하고, 응답·목소리·표정·자세 네 축의 4-Fit 지표로 다음 연습 방향을 확인합니다.</p>
        <Button size="lg" type="button" onClick={onPractice}>연습 시작하기 <ArrowRight size={18} /></Button>
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
          <p>프로젝트에 이미 정의된 4-Fit 설명을 바탕으로, 실제 구현된 리포트 흐름에 맞춰 소개합니다.</p>
        </div>
        <div className="public-card-grid public-card-grid--four">
          {homeFitSnapshot.map((fit) => (
            <Card className="public-feature-card public-feature-card--fit" key={fit.label}>
              <CardContent>
                <span className={`public-icon public-icon--${fit.tone}`}><IconGlyph icon={fit.icon || fit.tone} size={26} /></span>
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
