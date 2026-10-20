const plans = [
  { id: "plus", title: "Plus", audience: "일반 사용자", description: "필요한 대화를 AI와 미리 연습해요.", price: "요금 준비 중", action: "연습할 상황 적기", features: ["내가 적은 상황으로 대화 만들기", "면접·직장대화 연습", "상황에 맞는 AI 상대와 대화", "답변과 4-Fit 피드백 확인"] },
  { id: "pro", title: "Pro", audience: "일반 사용자", description: "난이도를 높여 까다로운 질문도 연습해요.", price: "요금 준비 중", action: "연습할 상황 적기", features: ["Plus의 개인 연습 기능", "난이도를 조절하는 대화 연습", "내 답변에 맞춘 추가 질문", "피드백을 보고 다시 연습하기"] },
  { id: "business", title: "Business", audience: "기업·팀", description: "팀의 업무에 맞춘 대화 연습을 준비하고 있어요.", price: "출시 때 안내해요", action: "기업 서비스 준비 중", upcoming: true, features: ["팀별 도입과 구성원 관리", "팀의 업무에 맞춘 연습 환경", "기업 전용 관리 기능", "기능과 요금은 출시 때 안내해요"] },
  { id: "enterprise", title: "Enterprise", audience: "중견·대기업", description: "회사에 맞는 서비스를 직접 개발해 제공할 예정이에요.", price: "별도 협의 예정", action: "맞춤형 서비스 준비 중", upcoming: true, features: ["회사별 요구사항에 맞춘 설계", "서비스 제공사가 직접 개발·구축", "회사 시스템과의 연결 범위 협의", "도입 방법과 일정은 출시 때 안내해요"] },
];

export function PricingPage({ onStart }) {
  return <section className="page pricing-page" aria-labelledby="pricing-title">
    <header className="pricing-heading"><h1 id="pricing-title">어떤 연습이 필요한가요?</h1><p>개인 연습과 기업 서비스를 비교해보세요.</p><span className="pricing-disclosure">요금제는 준비 중이에요. 기능과 금액은 아직 정하지 않았어요.</span></header>
    <div className="pricing-grid">
      {plans.map(plan => <article key={plan.id} className={`pricing-card pricing-card--${plan.id}`} aria-labelledby={`plan-${plan.id}`}>
        <div className="pricing-plan-heading"><span className="pricing-audience">{plan.audience}</span><h2 id={`plan-${plan.id}`}>{plan.title}</h2><p>{plan.description}</p></div>
        <div className="pricing-price">{plan.price}<small>{plan.upcoming ? "기업 서비스는 준비 중이에요" : "이용량과 결제 주기는 추후 안내해요"}</small></div>
        <button type="button" className="pricing-action" disabled={plan.upcoming} onClick={plan.upcoming ? undefined : onStart}>{plan.action}</button>
        <h3>{plan.upcoming ? "제공 예정" : "개인 연습 구성안"}</h3>
        <ul>{plan.features.map(feature => <li key={feature}><span aria-hidden="true">{plan.upcoming ? "○" : "✓"}</span>{feature}</li>)}</ul>
      </article>)}
    </div>
    <aside className="pricing-enterprise-note"><strong>기업 서비스는 준비 중이에요</strong><p>기업·팀 서비스는 아직 이용할 수 없어요. 중견·대기업에는 서비스 제공사가 요구사항을 확인해 별도 개발과 구축을 진행할 예정이에요.</p></aside>
  </section>;
}
