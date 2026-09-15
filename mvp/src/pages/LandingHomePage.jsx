import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Check } from "reicon-react/icons/Check";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, Card, CardContent } from "../components/ui/shadcn";
import { IconGlyph } from "../components/ui/IconGlyph";

const steps = [
  { title: "AI 연습하기를 눌러 모드를 선택해요", text: "면접, 직업훈련, 직장대화 중 지금 연습할 상황을 고릅니다." },
  { title: "직무와 시나리오를 고른 뒤 대화해요", text: "상대 역할과 난이도를 확인하고 카메라·마이크 권한을 허용하면 시작할 수 있어요." },
  { title: "결과 및 기록에서 4-Fit 리포트를 확인해요", text: "응답, 목소리, 표정, 자세 지표와 다음 연습에서 바꿀 한 가지를 확인합니다." },
];

const faqs = [
  { question: "Mirror-Ting은 무엇을 평가하나요?", answer: "대화 내용, 말 속도와 음량 같은 음성 신호, 화면을 통해 관측되는 표정과 자세 흐름을 4-Fit 기준으로 정리합니다." },
  { question: "AI 연습은 어디에서 시작하나요?", answer: "상단 메뉴의 AI 연습하기에서 시작합니다. 서비스 모드를 고른 뒤 직무, 시나리오, 난이도 순서로 설정합니다." },
  { question: "결과는 어디에서 다시 볼 수 있나요?", answer: "상단의 결과 및 기록에서 현재 결과와 이전 기록 진입 화면을 확인할 수 있습니다. 백엔드 기록 API가 연결되면 같은 화면에서 기록이 확장됩니다." },
  { question: "영상과 음성은 어떻게 다루나요?", answer: "현재 프로젝트의 흐름을 유지하며 연습에 필요한 권한을 요청합니다. 원본 저장과 인증 정책은 백엔드 연동 범위에서 별도로 확정됩니다." },
];

export function LandingHomePage({ onPractice, onIntro, onRecords }) {
  return (
    <section className="page public-page public-home-page">
      <header className="public-hero">
        <p className="public-eyebrow">Mirror-Ting</p>
        <h1>AI 역할극으로 직장 커뮤니케이션을 연습해요</h1>
        <p>상사 보고, 동료 거절, 갈등 조율처럼 실제로 어려운 대화를 안전하게 반복하고 4-Fit 리포트로 확인합니다.</p>
        <div className="public-actions">
          <Button size="lg" type="button" onClick={onPractice}>AI 연습하기 <ArrowRight size={18} /></Button>
          <Button size="lg" variant="outline" type="button" onClick={onIntro}>사이트 소개</Button>
        </div>
      </header>

      <section className="public-section public-section--split" aria-labelledby="home-guide-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">How to use</p>
          <h2 id="home-guide-title">사용 방법</h2>
          <p>전시장과 웹에서 같은 연습 흐름을 이해할 수 있도록 핵심 단계만 정리했습니다.</p>
        </div>
        <Card className="public-guide-card">
          <CardContent>
            {steps.map((step, index) => (
              <article className="public-step" key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                <Check size={18} aria-hidden="true" />
              </article>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="public-section public-section--accordion" aria-labelledby="home-faq-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">FAQ</p>
          <h2 id="home-faq-title">자주 묻는 질문</h2>
        </div>
        <Accordion className="public-accordion" type="single" collapsible>
          {faqs.map((item, index) => (
            <AccordionItem value={`faq-${index}`} key={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="public-next">
        <IconGlyph icon="report" size={26} />
        <div>
          <h2>이미 연습을 마쳤다면 결과를 확인해요</h2>
          <p>현재 세션의 분석 결과와 기록 진입 화면으로 이동합니다.</p>
        </div>
        <Button variant="outline" type="button" onClick={onRecords}>결과 및 기록</Button>
      </section>
    </section>
  );
}
