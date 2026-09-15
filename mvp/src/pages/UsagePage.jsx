import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button } from "../components/ui/shadcn";

const faqs = [
  { question: "Mirror-Ting은 무엇을 평가하나요?", answer: "대화 내용, 말 속도와 음량 같은 음성 신호, 화면을 통해 관측되는 표정과 자세 흐름을 4-Fit 기준으로 정리합니다." },
  { question: "AI 연습은 어디에서 시작하나요?", answer: "모드 선택 화면에서 면접, 직업훈련, 직장대화 중 하나를 선택해 주세요. 서비스 모드를 고른 뒤 직무, 시나리오, 난이도 순서로 설정합니다." },
  { question: "결과는 어디에서 다시 볼 수 있나요?", answer: "상단의 결과 및 기록에서 현재 연습 결과를 확인할 수 있어요. 이전 기록 조회는 준비 중입니다." },
  { question: "영상과 음성은 어떻게 다루나요?", answer: "현재 프로젝트의 흐름을 유지하며 연습에 필요한 권한을 요청합니다. 원본 저장과 인증 정책은 백엔드 연동 범위에서 별도로 확정됩니다." },
];

export function UsagePage({ onPractice }) {
  return <section className="page public-page usage-page">
    <header className="public-hero public-hero--compact">
      <p className="public-eyebrow">How to use</p>
      <h1>사용방법</h1>
      <p>모드 선택부터 결과 확인까지, 자주 묻는 질문을 모았어요.</p>
      <div><Button onClick={onPractice}>연습하러 가기</Button></div>
    </header>
      <section className="public-section public-section--accordion" aria-labelledby="usage-faq-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">FAQ</p>
          <h2 id="usage-faq-title">자주 묻는 질문</h2>
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

  </section>;
}
