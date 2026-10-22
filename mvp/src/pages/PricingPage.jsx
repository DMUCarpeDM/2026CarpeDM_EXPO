import { faqItems, faqHref } from "./FaqPage";
import { useState } from "react";
const plans = [
  { id: "plus", title: "Plus", audience: "일반 사용자", description: "필요한 대화를 AI와 미리 연습해요.", price: "요금 준비 중", action: "연습할 상황 적기", features: ["내가 적은 상황으로 대화 만들기", "면접·직장대화 연습", "상황에 맞는 AI 상대와 대화", "답변과 4-Fit 피드백 확인"] },
  { id: "pro", title: "Pro", audience: "일반 사용자", description: "난이도를 높여 까다로운 질문도 연습해요.", price: "요금 준비 중", action: "연습할 상황 적기", features: ["면접·직장대화 개인 연습", "난이도를 조절하는 대화 연습", "내 답변에 맞춘 추가 질문", "피드백을 보고 다시 연습하기"] },
  { id: "business", title: "Business", audience: "기업·팀", description: "팀의 업무에 맞춘 대화 연습을 준비하고 있어요.", price: "출시 때 안내해요", action: "기업 서비스 준비 중", upcoming: true, features: ["팀별 도입과 구성원 관리", "팀의 업무에 맞춘 연습 환경", "기업 전용 관리 기능", "기능과 요금은 출시 때 안내해요"] },
  { id: "enterprise", title: "Enterprise", audience: "중견·대기업", description: "회사에 맞는 서비스를 직접 개발해 제공할 예정이에요.", price: "별도 협의 예정", action: "맞춤형 서비스 준비 중", upcoming: true, features: ["회사별 요구사항에 맞춘 설계", "서비스 제공사가 직접 개발·구축", "회사 시스템과의 연결 범위 협의", "도입 방법과 일정은 출시 때 안내해요"] },
];

export function PricingPage({ onStart }) {
  const [billing, setBilling] = useState("monthly");
  return <section className="page pricing-page lovable-pricing" aria-labelledby="pricing-title">
    <header className="pricing-heading"><h1 id="pricing-title">요금제</h1><p>개인 연습과 기업 서비스를 비교해보세요.</p><span className="pricing-disclosure">요금제는 준비 중이에요. 기능과 금액은 아직 정하지 않았어요.</span></header>
    <div className="pricing-billing" role="group" aria-label="결제 주기"><button type="button" aria-pressed={billing === "monthly"} onClick={() => setBilling("monthly")}>월간</button><button type="button" aria-pressed={billing === "yearly"} onClick={() => setBilling("yearly")}>연간</button></div>
    <div className="pricing-grid">
      {plans.filter(plan => plan.id !== "plus").map(plan => <article key={plan.id} className={`pricing-card pricing-card--${plan.id}`} aria-labelledby={`plan-${plan.id}`}>
        <div className="pricing-plan-heading"><span className="pricing-audience">{plan.audience}</span><h2 id={`plan-${plan.id}`}>{plan.title}</h2><p>{plan.description}</p></div>
        <div className="pricing-price">{plan.price}<small>{plan.upcoming ? "기업 서비스는 준비 중이에요" : `${billing === "yearly" ? "연간" : "월간"} 요금은 추후 안내해요`}</small></div>
        <button type="button" className="pricing-action" disabled={plan.upcoming} onClick={plan.upcoming ? undefined : onStart}>{plan.action}</button>
        <h3>{plan.upcoming ? "제공 예정" : "개인 연습 구성안"}</h3>
        <ul>{plan.features.map(feature => <li key={feature}><span aria-hidden="true">{plan.upcoming ? "○" : "✓"}</span>{feature}</li>)}</ul>
      </article>)}
    </div>
    <div className="pricing-extras"><article><h2>개인 연습부터 시작하기</h2><p>면접과 직장 대화를 AI와 준비해보세요.</p><button type="button" onClick={onStart}>연습 시작하기 →</button></article><article><h2>팀을 위한 연습</h2><p>팀의 업무에 맞춘 연습 환경을 준비하고 있어요.</p></article><article><h2>맞춤형 기업 서비스</h2><p>기업별 요구사항과 도입 범위를 협의할 예정이에요.</p></article></div>
    <aside className="pricing-enterprise-note"><strong>기업 서비스는 준비 중이에요</strong><p>기업·팀 서비스는 아직 이용할 수 없어요. 중견·대기업에는 서비스 제공사가 요구사항을 확인해 별도 개발과 구축을 진행할 예정이에요.</p></aside>
    <section className="pricing-faq" aria-labelledby="pricing-faq-title"><header><h2 id="pricing-faq-title">자주 묻는 질문</h2><a href={faqHref()}>모든 질문 보기 →</a></header><div className="faq-list">{faqItems.map(item => <a key={item.id} href={faqHref(item.id)}>{item.question}<span aria-hidden="true">→</span></a>)}</div></section>
  </section>;
}
