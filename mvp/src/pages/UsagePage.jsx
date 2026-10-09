import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button } from "../components/ui/shadcn";

const faqs = [
  { question: "Mirror-Ting은 무엇을 평가하나요?", answer: "대화 내용, 말 속도와 음량 같은 음성 신호, 화면을 통해 관측되는 표정과 자세 흐름을 4-Fit 기준으로 정리합니다." },
  { question: "AI 연습은 어디에서 시작하나요?", answer: "면접·직업훈련은 홈에서 직무, 시나리오, 난이도를 고른 뒤 시작해요. 직장대화는 홈에서 연습 시작하기를 누르면 사전 안내로 바로 이동해요." },
  { question: "결과는 어디에서 다시 볼 수 있나요?", answer: "상단의 결과 및 기록에서 현재 연습 결과를 확인할 수 있어요. 이전 기록 조회는 준비 중입니다." },
  { question: "영상과 음성은 어떻게 다루나요?", answer: "연습에는 카메라와 마이크 권한이 필요해요. 음성 인식과 AI 분석을 위해 음성이나 대화 내용이 서버로 전송될 수 있어요. 민감한 개인정보는 말하지 말아 주세요." },
];

const steps = [
  ["연습할 상황 고르기", "면접·직업훈련은 직무, 시나리오, 난이도를 차례로 골라요. 직장대화는 홈에서 사전 안내로 바로 이동해요."],
  ["시작 전 확인하기", "사전 안내와 데이터 처리 내용을 읽고, 카메라와 마이크를 사용할 수 있는지 확인해요."],
  ["내 말로 대화하기", "상대의 질문을 듣고 평소 말하듯 답해보세요. 완벽한 문장을 외울 필요는 없어요."],
  ["피드백으로 다시 연습하기", "결과에서 잘한 점과 바꿀 행동을 확인해요. 다음 답변에는 한 가지만 적용해보세요."],
];

export function UsagePage({ onPractice }) {
  return <section className="page public-page usage-page">
    <header className="public-hero public-hero--compact">
      <p className="public-eyebrow">MIRROR-TING / 사용방법</p>
      <h1>처음이라도,<br />순서대로 따라오세요.</h1>
      <p>상황을 고르고, 말해보고, 피드백을 확인해요. 한 번의 연습은 이렇게 이어집니다.</p>
      <div><Button size="lg" onClick={onPractice}>연습 홈으로 가기</Button></div>
    </header>
      <section className="public-section public-section--split" aria-labelledby="usage-steps-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">01 / 연습 순서</p>
          <h2 id="usage-steps-title">선택부터 피드백까지.</h2>
          <p>현재 선택한 서비스의 홈에서 시작할 수 있어요.</p>
        </div>
        <ol className="public-steps">
          {steps.map(([title, description], index) => <li className="public-step" key={title}>
            <span aria-hidden="true">0{index + 1}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </li>)}
        </ol>
      </section>
      <aside className="public-preparation" aria-labelledby="usage-ready-title">
        <h2 id="usage-ready-title">시작하기 전에 확인해 주세요.</h2>
        <ul>
          <li><strong>조용하고 밝은 곳</strong><p>주변 소음을 줄이고 얼굴과 상체가 화면에 들어오도록 앉아주세요.</p></li>
          <li><strong>카메라·마이크 권한</strong><p>차단했다면 브라우저의 사이트 설정에서 권한을 허용한 뒤 다시 시도해 주세요.</p></li>
          <li><strong>개인정보는 제외</strong><p>연습 중에는 주민등록번호, 연락처 등 민감한 정보를 말하지 마세요.</p></li>
        </ul>
      </aside>
      <section className="public-section public-section--split" aria-labelledby="usage-faq-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">02 / 더 궁금한 점</p>
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
