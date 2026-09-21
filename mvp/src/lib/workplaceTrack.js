import { WORKPLACE_SCENARIO_SLUG } from "../data/workplaceStories.js";

export { WORKPLACE_SCENARIO_SLUG };

const WORKPLACE_MODES = new Set(["workplace", "workplace_continuous"]);

export function workplaceStartView(serviceModeId) {
  return serviceModeId === "workplace" ? "preview" : "role";
}

export function isWorkplaceSession(session) {
  return WORKPLACE_MODES.has(session?.interaction?.mode) || session?.scenario?.slug === WORKPLACE_SCENARIO_SLUG;
}

export function workplaceBriefing(interaction) {
  if (!WORKPLACE_MODES.has(interaction?.mode)) return null;
  return interaction.briefing || null;
}
