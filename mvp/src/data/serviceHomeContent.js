const interviewContent = Object.freeze({
  id: "interview",
  hero: "실전 질문 앞에서도 핵심을 또렷하게 말해요",
  value: "실전 압박·질문 대응",
  primaryCta: "면접 상황 고르기",
  recommendationContext: "자기소개와 꼬리 질문에 답하는 흐름부터 추천해요.",
  tone: "blue",
  benefitOrder: Object.freeze(["실감나는\nAI 역할극", "상세한\n맞춤 리포트", "비교하고\n더 나아지기", "성장 기록으로\n한눈에 확인", "자신감 있는\n커뮤니케이션"]),
  fitOrder: Object.freeze(["응답 (Response-Fit)", "목소리 (Voice-Fit)", "표정 (Expression-Fit)", "자세 (Posture-Fit)"]),
});

const trainingContent = Object.freeze({
  id: "training",
  hero: "업무를 수행하며 차분한 응대와 코칭을 익혀요",
  value: "과업 수행·코칭",
  primaryCta: "훈련 상황 고르기",
  recommendationContext: "고객 응대와 현장 업무를 단계별로 연습해요.",
  tone: "sky",
  benefitOrder: Object.freeze(["실감나는\nAI 역할극", "성장 기록으로\n한눈에 확인", "상세한\n맞춤 리포트", "자신감 있는\n커뮤니케이션", "비교하고\n더 나아지기"]),
  fitOrder: Object.freeze(["자세 (Posture-Fit)", "응답 (Response-Fit)", "목소리 (Voice-Fit)", "표정 (Expression-Fit)"]),
});

const workplaceContent = Object.freeze({
  id: "workplace",
  hero: "보고와 피드백을 주고받으며 협업을 편하게 만들어요",
  value: "협업·보고·피드백",
  primaryCta: "대화 상황 고르기",
  recommendationContext: "팀장 보고와 동료 피드백처럼 자주 만나는 대화를 추천해요.",
  tone: "accent",
  benefitOrder: Object.freeze(["상세한\n맞춤 리포트", "실감나는\nAI 역할극", "자신감 있는\n커뮤니케이션", "비교하고\n더 나아지기", "성장 기록으로\n한눈에 확인"]),
  fitOrder: Object.freeze(["표정 (Expression-Fit)", "목소리 (Voice-Fit)", "응답 (Response-Fit)", "자세 (Posture-Fit)"]),
});

export const serviceHomeContent = Object.freeze({
  interview: interviewContent,
  training: trainingContent,
  workplace: workplaceContent,
});

export function resolveServiceHomeContent(id) {
  return Object.hasOwn(serviceHomeContent, id) ? serviceHomeContent[id] : serviceHomeContent.workplace;
}
