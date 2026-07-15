import fitIconResponse from "../assets/fit-icon-response.png";
import fitIconVoice from "../assets/fit-icon-voice.png";
import fitIconEye from "../assets/fit-icon-eye.png";
import fitIconPosture from "../assets/fit-icon-posture.png";
import serviceIconTarget from "../assets/service-icon-target.png";
import serviceIconReport from "../assets/service-icon-report.png";
import serviceIconCompare from "../assets/service-icon-compare.png";
import serviceIconGrowth from "../assets/service-icon-growth.png";
import serviceIconConfidence from "../assets/service-icon-confidence.png";

export const homeFitSnapshot = [
  { image: fitIconResponse, label: "응답 (Response-Fit)", short: "응답", score: 82, tone: "response", text: "핵심부터 말하면 더 또렷하게 들려요." },
  { image: fitIconVoice, label: "목소리 (Voice-Fit)", short: "목소리", score: 76, tone: "voice", text: "편한 속도로 또렷하게 말해요." },
  { image: fitIconEye, label: "시선 (Eye-Fit)", short: "시선", score: 88, tone: "eye", text: "상대와 자연스럽게 시선을 맞춰요." },
  { image: fitIconPosture, label: "자세 (Posture-Fit)", short: "자세", score: 71, tone: "posture", text: "편한 자세로 끝까지 말해봐요." },
];

export const homeAdvantages = [
  { image: serviceIconTarget, title: "실감나는\nAI 역할극", text: "AI가 실제 업무 상황을 맡아 대화를 이어가요.", detail: "보고·협업·피드백 상황에서 편하게 말해봐요." },
  { image: serviceIconReport, title: "상세한\n맞춤 리포트", text: "내가 잘한 점과 다음에 바꿔볼 점을 한눈에 살펴봐요.", detail: "다음 대화에서 바로 해볼 한 가지를 알려드려요." },
  { image: serviceIconCompare, title: "비교하고\n더 나아지기", text: "이전 기록과 나란히 보며 달라진 점을 확인해요.", detail: "점수와 답변 흐름을 함께 비교해요." },
  { image: serviceIconGrowth, title: "성장 기록으로\n한눈에 확인", text: "시간이 지날수록 달라지는 점수를 쉽게 확인해요.", detail: "연습할수록 달라지는 흐름을 기록해요." },
  { image: serviceIconConfidence, title: "자신감 있는\n커뮤니케이션", text: "자주 연습하면 내 생각을 또렷하게 말할 수 있어요.", detail: "짧은 연습을 쌓아 자신 있게 대화해요." },
];
