import setupRoleDeveloper from "../assets/setup-icons/job-developer.webp";
import setupRoleCafePartner from "../assets/setup-icons/job-cafe-partner.webp";
import setupRoleCounselor from "../assets/setup-icons/job-counselor.webp";
import setupDifficultyBasic from "../assets/setup-icons/difficulty-basic.webp";
import setupDifficultyRudeCustomer from "../assets/setup-icons/difficulty-rude-customer.webp";
import setupDifficultyExtremeRudeCustomer from "../assets/setup-icons/difficulty-extreme-rude-customer.webp";
import setupScenarioKickoff from "../assets/setup-icons/scenario-kickoff.webp";
import setupScenarioFeaturePriority from "../assets/setup-icons/scenario-feature-priority.webp";
import setupScenarioScopeSchedule from "../assets/setup-icons/scenario-scope-schedule.webp";
import setupScenarioCoordinate from "../assets/setup-scenario-coordinate.webp";
import setupScenarioNegotiation from "../assets/setup-scenario-negotiation.webp";
import setupScenarioRetro from "../assets/setup-scenario-retro.webp";
import setupScenarioServer from "../assets/setup-scenario-server.webp";

const SERVICE_MODE_FIELDS = [
  "id",
  "label",
  "description",
  "detail",
  "icon",
  "tone",
  "setupTitle",
  "setupDescription",
  "scenarioDescription",
  "emptyScenarioMessage",
  "previewEyebrow",
];
const SERVICE_MODE_IDS = ["interview", "training", "workplace"];
const SERVICE_MODE_ICONS = ["interview", "coach", "meeting"];
const SERVICE_MODE_TONES = ["blue", "sky", "accent", "danger"];

export function validateServiceModes(catalog) {
  if (!Array.isArray(catalog) || catalog.length !== SERVICE_MODE_IDS.length) {
    throw new TypeError("serviceModes must contain exactly three entries");
  }

  catalog.forEach((mode, index) => {
    if (!mode || typeof mode !== "object" || Array.isArray(mode)) {
      throw new TypeError(`service mode ${index} must be an object`);
    }
    const fields = Object.keys(mode).sort();
    if (fields.length !== SERVICE_MODE_FIELDS.length || fields.some((field, fieldIndex) => field !== [...SERVICE_MODE_FIELDS].sort()[fieldIndex])) {
      throw new TypeError(`service mode ${index} has an invalid field set`);
    }
    if (mode.id !== SERVICE_MODE_IDS[index]) {
      throw new TypeError(`service mode ${index} must use id ${SERVICE_MODE_IDS[index]}`);
    }
    for (const field of SERVICE_MODE_FIELDS) {
      if (typeof mode[field] !== "string" || !mode[field].trim()) {
        throw new TypeError(`service mode ${mode.id} requires a non-empty ${field}`);
      }
    }
    if (!SERVICE_MODE_ICONS.includes(mode.icon)) {
      throw new TypeError(`service mode ${mode.id} uses an unsupported icon`);
    }
    if (!SERVICE_MODE_TONES.includes(mode.tone)) {
      throw new TypeError(`service mode ${mode.id} uses an unsupported tone`);
    }
  });

  return catalog;
}

const serviceModeDefinitions = [
  {
    id: "interview",
    label: "면접",
    description: "실전 질문에 또렷하게 답하는 연습",
    detail: "자기소개부터 직무 질문까지 모의면접",
    icon: "interview",
    tone: "blue",
    setupTitle: "면접 상황을 골라볼까요?",
    setupDescription: "지원한 직무에서 자주 만나는 질문을 골라 답변 흐름을 연습해요.",
    scenarioDescription: "지원 직무와 면접 단계에 맞는 질문으로 답변을 준비해요.",
    emptyScenarioMessage: "아직 준비된 면접 시나리오가 없어요. 다른 모드를 선택해 주세요.",
    previewEyebrow: "실전 모의면접",
  },
  {
    id: "training",
    label: "직업훈련",
    description: "고객응대와 현장 업무를 차분히 익히는 연습",
    detail: "고객 응대부터 동료 협업까지 현장 대화 훈련",
    icon: "coach",
    tone: "sky",
    setupTitle: "어떤 업무 상황을 연습할까요?",
    setupDescription: "현장에서 자주 만나는 대화를 골라 차분한 응대 흐름을 익혀요.",
    scenarioDescription: "고객과 동료를 만나는 실제 업무 상황으로 연습해요.",
    emptyScenarioMessage: "아직 준비된 직업훈련 시나리오가 없어요. 다른 모드를 선택해 주세요.",
    previewEyebrow: "현장 업무 훈련",
  },
  {
    id: "workplace",
    label: "직장대화",
    description: "보고·피드백·협업 대화를 자연스럽게 연습",
    detail: "팀장 보고부터 동료 피드백까지 업무 대화",
    icon: "meeting",
    tone: "accent",
    setupTitle: "어떤 직장 대화를 연습할까요?",
    setupDescription: "보고, 피드백, 협업처럼 일하며 필요한 대화 상황을 골라요.",
    scenarioDescription: "팀과 함께 목표를 맞추고 의견을 나누는 상황을 연습해요.",
    emptyScenarioMessage: "아직 준비된 직장대화 시나리오가 없어요. 다른 모드를 선택해 주세요.",
    previewEyebrow: "직장 커뮤니케이션",
  },
];

export const serviceModes = Object.freeze(
  validateServiceModes(serviceModeDefinitions).map((mode) => Object.freeze(mode)),
);

export const difficulties = [
  { id: "basic", title: "기본 모드", text: "차분한 상대와 대화 흐름을 익혀요.", detail: "일반 질문 · 여유 있는 답변 시간", icon: "easy", image: setupDifficultyBasic, tone: "blue", badge: "추천" },
  { id: "pressure", title: "진상 모드", text: "불만이 많은 상대에게도 차분히 답해요.", detail: "추가 질문 · 반복 확인 · 대안 제시", icon: "hard", image: setupDifficultyRudeCustomer, tone: "accent", badge: "도전" },
  { id: "ultra_pressure", title: "왕진상 모드", text: "연속 질문에도 핵심을 놓치지 않아요.", detail: "빠른 질문 · 즉시 판단 · 단호한 응대", icon: "hard", image: setupDifficultyExtremeRudeCustomer, tone: "danger", badge: "고난도" },
];

const scenarioImages = {
  "release-schedule-alignment": setupScenarioCoordinate,
  "cloudmeet-incident-day": setupScenarioServer,
  "partner-negotiation": setupScenarioNegotiation,
  "team-retrospective": setupScenarioRetro,
};

export function getScenarioImage(slug) {
  return scenarioImages[slug] || setupScenarioKickoff;
}

const developerEpisodeImages = {
  1: setupScenarioKickoff,
  3: setupScenarioScopeSchedule,
  4: setupScenarioFeaturePriority,
};

export function getEpisodeImage(slug, episodeId) {
  return developerEpisodeImages[episodeId] || getScenarioImage(slug);
}

export function getScenarioDescription(situation = "") {
  return situation.replace(/^(?:[가-힣]+요일\s+)?\d{1,2}:\d{2}\.\s*/, "");
}

export function getRoleScenarioOptions(scenarios, jobRole, mode = 5) {
  return scenarios.flatMap((scenario) => {
    if (scenario.job_role !== jobRole) return [];
    const characterById = new Map(
      (scenario.characters || []).map((character) => [character.id, character]),
    );

    return (scenario.episodes || [])
      .filter((episode) => {
        return (episode.modes || []).includes(mode);
      })
      .map((episode) => ({
        id: `${scenario.slug}-${episode.character_id}-${episode.title}`,
        scenarioSlug: scenario.slug,
        scenarioTitle: scenario.title,
        episodeId: episode.id,
        title: episode.title,
        description: getScenarioDescription(episode.situation),
        character: characterById.get(episode.character_id),
      }));
  });
}

export const setupSteps = [["1", "직무 선택"], ["2", "시나리오 선택"], ["3", "난이도 선택"]];

export const counterpartProfiles = [
  { id: "office_admin", title: "개발자", text: "출시 일정과 우선순위를 정리해요", image: setupRoleDeveloper, icon: "role" },
  { id: "cafe_crew", title: "카페 파트너", text: "매장에서 고객과 동료를 응대해요", image: setupRoleCafePartner, icon: "team" },
  { id: "cs_agent", title: "상담사", text: "고객 문의를 듣고 해결 방법을 안내해요", image: setupRoleCounselor, icon: "chat" },
];
