import setupRoleColleague from "../assets/setup-role-colleague-realistic.png";
import setupRoleManager from "../assets/setup-role-manager-realistic.png";
import setupRoleExecutive from "../assets/setup-role-executive-realistic.png";
import setupRolePartner from "../assets/setup-role-partner-realistic.png";
import setupDifficultyBasic from "../assets/setup-difficulty-basic.webp";
import setupDifficultyPressure from "../assets/setup-difficulty-pressure.webp";
import setupDifficultyUltraPressure from "../assets/setup-difficulty-ultra-pressure.png";
import setupScenarioCoordinate from "../assets/setup-scenario-coordinate.webp";
import setupScenarioNegotiation from "../assets/setup-scenario-negotiation.webp";
import setupScenarioRetro from "../assets/setup-scenario-retro.webp";
import setupScenarioServer from "../assets/setup-scenario-server.webp";

export const difficulties = [
  { id: "basic", title: "기본 모드", text: "부담 없이 대화 흐름을 연습해요.", detail: "일반적인 질문 · 편안한 흐름", icon: "easy", image: setupDifficultyBasic, tone: "blue", badge: "추천" },
  { id: "pressure", title: "압박 모드", text: "까다로운 질문까지 이어서 연습해요.", detail: "시간 제약과 추가 질문 · 높은 기대치", icon: "hard", image: setupDifficultyPressure, tone: "accent", badge: "도전" },
  { id: "ultra_pressure", title: "초압박 모드", text: "짧은 시간 안에 우선순위를 정리해요.", detail: "연속 질문 · 즉시 판단 · 강한 압박", icon: "hard", image: setupDifficultyUltraPressure, tone: "accent", badge: "고난도" },
];

const scenarioImages = {
  "release-schedule-alignment": setupScenarioCoordinate,
  "cloudmeet-incident-day": setupScenarioServer,
  "partner-negotiation": setupScenarioNegotiation,
  "team-retrospective": setupScenarioRetro,
};

export function getScenarioImage(slug) {
  return scenarioImages[slug] || setupScenarioCoordinate;
}

const roleKeywords = {
  colleague: /동료|협업자|선임|개발자/,
  manager: /상사|팀장|관리자|리더/,
  executive: /임원|경영|대표|본부장/,
  partner: /고객|외부|파트너|CS/,
};

export function getRoleScenarioOptions(scenarios, counterpartProfile, mode = 5) {
  const keyword = roleKeywords[counterpartProfile];
  if (!keyword) return [];

  return scenarios.flatMap((scenario) => {
    const characterById = new Map(
      (scenario.characters || []).map((character) => [character.id, character]),
    );

    return (scenario.episodes || [])
      .filter((episode) => {
        const character = characterById.get(episode.character_id);
        return (episode.modes || []).includes(mode) && (character?.role_key === counterpartProfile || keyword.test(character?.role || ""));
      })
      .map((episode) => ({
        id: `${scenario.slug}-${episode.character_id}-${episode.title}`,
        scenarioSlug: scenario.slug,
        scenarioTitle: scenario.title,
        episodeId: episode.id,
        title: episode.title,
        description: episode.situation,
        character: characterById.get(episode.character_id),
      }));
  });
}

export const setupSteps = [["1", "상대 역할 선택"], ["2", "시나리오 선택"], ["3", "난이도 선택"]];

export const counterpartProfiles = [
  { id: "colleague", title: "동료", text: "같은 팀의 동료와 대화", image: setupRoleExecutive, icon: "team" },
  { id: "manager", title: "상사", text: "상사에게 보고하거나 의견을 조율", image: setupRoleColleague, icon: "role" },
  { id: "executive", title: "임원", text: "임원에게 제안하거나 전략을 논의", image: setupRoleManager, icon: "briefcase" },
  { id: "partner", title: "외부 파트너", text: "협력 회사와 일정과 역할을 조율", image: setupRolePartner, icon: "negotiation" },
];
