import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button } from "../components/ui/shadcn";

const faqs = [
  { question: "어떤 피드백을 받을 수 있나요?", answer: "답변과 목소리, 표정, 자세를 살펴봐요. 표정이나 자세만으로 감정과 의도를 판단하지 않아요." },
  { question: "AI 연습은 어디에서 시작하나요?", answer: "홈에 연습할 상황을 적고 화살표 버튼을 눌러주세요. 난이도를 고르고 데이터 처리에 동의하면 AI가 대화를 만들어요. NFC·스마트미러 체험은 현장 안내를 따라주세요." },
  { question: "결과는 어디에서 다시 볼 수 있나요?", answer: "상단의 연습 기록에서 현재 결과와 최근 기록을 확인할 수 있어요. 이전 기록의 상세 화면은 준비 중이에요." },
  { question: "영상과 음성은 어떻게 다루나요?", answer: "연습에는 카메라와 마이크 권한이 필요해요. 음성 인식과 AI 분석을 위해 음성이나 대화 내용이 서버로 전송될 수 있어요. 주민등록번호나 연락처 등 개인정보는 제외하고 연습해주세요." },
];

const steps = [
  ["연습할 상황 적기", "누구와 어떤 이야기를 나눌지 적고 난이도를 골라요."],
  ["시작 전 확인하기", "카메라·마이크 권한과 데이터 처리 안내를 확인해요."],
  ["내 말로 대화하기", "상대의 질문을 듣고 평소 말하듯 답해보세요. 완벽한 문장을 외울 필요는 없어요."],
  ["피드백 보고 다시 연습하기", "결과에서 잘한 점과 바꿀 행동을 확인해요. 다음 답변에는 한 가지만 적용해보세요."],
];

export function UsagePage({ onPractice }) {
  return <section className="page public-page usage-page">
    <header className="public-hero public-hero--compact">
      <p className="public-eyebrow">MIRROR-TING / 사용 방법</p>
      <h1>이렇게 연습해요</h1>
      <p>연습할 상황을 적으면 AI가 대화 상대가 돼요.</p>
      <div><Button size="lg" onClick={onPractice}>연습할 상황 적기</Button></div>
    </header>
      <section className="public-section public-section--split" aria-labelledby="usage-steps-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">01 / 연습 순서</p>
          <h2 id="usage-steps-title">상황 입력부터 피드백까지</h2>
          <p>홈에서 연습할 상황을 적어보세요.</p>
        </div>
        <ol className="public-steps">
          {steps.map(([title, description], index) => <li className="public-step" key={title}>
            <span aria-hidden="true">0{index + 1}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </li>)}
        </ol>
      </section>
      <aside className="public-preparation" aria-labelledby="usage-ready-title">
        <h2 id="usage-ready-title">시작 전에 확인해주세요</h2>
        <ul>
          <li><strong>조용하고 밝은 곳</strong><p>주변 소음을 줄이고 얼굴과 상체가 화면에 들어오도록 앉아주세요.</p></li>
          <li><strong>카메라·마이크 권한</strong><p>차단했다면 브라우저의 사이트 설정에서 권한을 허용한 뒤 다시 시도해주세요.</p></li>
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
