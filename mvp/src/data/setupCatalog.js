import setupRoleColleague from "../assets/setup-role-colleague.webp";
import setupRoleManager from "../assets/setup-role-manager.webp";
import setupRoleExecutive from "../assets/setup-role-executive.webp";
import setupRolePartner from "../assets/setup-role-partner.webp";
import setupDifficultyBasic from "../assets/setup-difficulty-basic.webp";
import setupDifficultyPressure from "../assets/setup-difficulty-pressure.webp";
import setupScenarioServer from "../assets/setup-scenario-server.webp";
import setupScenarioRetro from "../assets/setup-scenario-retro.webp";
import setupScenarioNegotiation from "../assets/setup-scenario-negotiation.webp";
import setupScenarioCoordinate from "../assets/setup-scenario-coordinate.webp";
import setupGoalPrep from "../assets/setup-goal-prep.webp";
import setupGoalEmpathy from "../assets/setup-goal-empathy.webp";
import setupGoalDesc from "../assets/setup-goal-desc.webp";
import setupGoalWinwin from "../assets/setup-goal-winwin.webp";
import setupGoalAlignment from "../assets/setup-goal-alignment.webp";

export const difficulties = [
  { id: "basic", title: "기본 모드", text: "부담 없이 대화 흐름을 연습해요.", detail: "일반적인 질문과 대화 · 편안한 분위기", icon: "easy", image: setupDifficultyBasic, tone: "blue", badge: "추천" },
  { id: "pressure", title: "압박 모드", text: "까다로운 질문까지 이어서 연습해요.", detail: "시간 제약과 추가 질문 · 높은 기대치", icon: "hard", image: setupDifficultyPressure, tone: "accent", badge: "도전" },
];

export const setupSteps = [["1", "기본 설정"], ["2", "상황 선택"], ["3", "목표 선택"]];

export const counterpartProfiles = [
  { id: "colleague", title: "동료", text: "같은 팀의 동료와 대화", image: setupRoleColleague, icon: "team" },
  { id: "manager", title: "상사 / 관리자", text: "상사에게 보고하거나 의견을 조율", image: setupRoleManager, icon: "role" },
  { id: "executive", title: "임원 / 경영진", text: "임원에게 제안하거나 전략을 논의", image: setupRoleExecutive, icon: "briefcase" },
  { id: "partner", title: "고객 / 외부 파트너", text: "고객 대응이나 협상 상황", image: setupRolePartner, icon: "negotiation" },
];

export const practiceGoals = {
  prep: { id: "prep", title: "PREP 보고", text: "핵심을 먼저 말하고 논리적으로 보고해요.", detail: "핵심 정리", image: setupGoalPrep, mode: 5 },
  empathy: { id: "empathy", title: "진심 어린 공감", text: "문제를 인정하고 진심을 전해요.", detail: "관계 회복", image: setupGoalEmpathy, mode: 10 },
  desc: { id: "desc", title: "DESC 거절", text: "단호하고 정중하게 요청을 정리해요.", detail: "경계 세우기", image: setupGoalDesc, mode: 5 },
  winwin: { id: "winwin", title: "Win-Win 제안", text: "상대의 니즈를 고려해 함께 해법을 찾아요.", detail: "상호 이익", image: setupGoalWinwin, mode: 10 },
  alignment: { id: "alignment", title: "명확한 의견 제시", text: "근거를 바탕으로 의견을 또렷하게 말해요.", detail: "의견 합의", image: setupGoalAlignment, mode: 5 },
};

export const scenarioCatalogByRole = {
  colleague: [
    { id: "colleague-incident", title: "서버 장애 대응", text: "동료와 함께 현재 상황을 정리하고 고객 대응을 준비해요.", detail: "긴급 협업", image: setupScenarioServer, goalIds: ["prep", "empathy", "desc", "alignment"] },
    { id: "colleague-retro", title: "프로젝트 회고", text: "함께 진행한 결과를 돌아보고 다음 실행안을 정해요.", detail: "팀 미팅", image: setupScenarioRetro, goalIds: ["prep", "empathy", "alignment"] },
    { id: "colleague-coordinate", title: "업무 조율 요청", text: "업무 우선순위와 담당 범위를 동료와 조율해요.", detail: "협업 조율", image: setupScenarioCoordinate, goalIds: ["empathy", "desc", "alignment"] },
    { id: "colleague-proposal", title: "개선안 제안", text: "팀에 필요한 개선 아이디어를 설득력 있게 제안해요.", detail: "아이디어 공유", image: setupScenarioRetro, goalIds: ["prep", "winwin", "alignment"] },
  ],
  manager: [
    { id: "manager-incident", title: "서버 장애 보고", text: "서비스 장애의 영향과 대응 계획을 상사에게 보고해요.", detail: "긴급 보고", image: setupScenarioServer, goalIds: ["prep", "empathy", "desc", "winwin", "alignment"] },
    { id: "manager-retro", title: "프로젝트 회고", text: "프로젝트 완료 후 성과와 개선점을 상사와 정리해요.", detail: "팀 미팅", image: setupScenarioRetro, goalIds: ["prep", "empathy", "alignment"] },
    { id: "manager-resource", title: "업무 조율 요청", text: "일정과 리소스의 우선순위를 조정해 달라고 요청해요.", detail: "업무 조율", image: setupScenarioCoordinate, goalIds: ["prep", "desc", "alignment"] },
    { id: "manager-feedback", title: "1:1 피드백", text: "업무 방식에 대한 피드백을 주고 다음 행동을 합의해요.", detail: "피드백 면담", image: setupScenarioCoordinate, goalIds: ["empathy", "desc", "alignment"] },
  ],
  executive: [
    { id: "executive-proposal", title: "신규 제안 보고", text: "핵심 근거와 기대 효과를 임원에게 간결하게 제안해요.", detail: "전략 제안", image: setupScenarioRetro, goalIds: ["prep", "alignment"] },
    { id: "executive-review", title: "분기 성과 회고", text: "성과와 리스크를 요약해 다음 분기의 판단을 돕는 보고를 해요.", detail: "성과 보고", image: setupScenarioRetro, goalIds: ["prep", "desc", "alignment"] },
    { id: "executive-budget", title: "예산 협상", text: "필요한 투자와 우선순위를 근거로 설명해 합의를 이끌어요.", detail: "의사결정", image: setupScenarioNegotiation, goalIds: ["prep", "winwin", "alignment"] },
    { id: "executive-risk", title: "리스크 대응", text: "발생 가능성이 높은 리스크와 대응안을 빠르게 보고해요.", detail: "리스크 보고", image: setupScenarioServer, goalIds: ["prep", "desc"] },
  ],
  partner: [
    { id: "partner-incident", title: "고객 장애 대응", text: "서비스 이슈를 설명하고 고객의 우려에 대응하는 대화를 연습해요.", detail: "고객 응대", image: setupScenarioServer, goalIds: ["prep", "empathy", "desc", "alignment"] },
    { id: "partner-negotiation", title: "계약 갱신 협상", text: "상대의 요구를 확인하고 서로에게 좋은 조건을 제안해요.", detail: "1:1 협상", image: setupScenarioNegotiation, goalIds: ["prep", "winwin", "alignment"] },
    { id: "partner-review", title: "프로젝트 결과 공유", text: "프로젝트 성과와 다음 계획을 외부 파트너에게 공유해요.", detail: "결과 공유", image: setupScenarioRetro, goalIds: ["prep", "empathy", "alignment"] },
    { id: "partner-coordinate", title: "일정 조율 요청", text: "일정 변경 사유를 설명하고 실행 가능한 대안을 제안해요.", detail: "일정 조율", image: setupScenarioCoordinate, goalIds: ["empathy", "winwin", "alignment"] },
  ],
};

export const scenariosForRole = (roleId) => scenarioCatalogByRole[roleId] || scenarioCatalogByRole.manager;
export { setupScenarioServer, setupGoalPrep };
