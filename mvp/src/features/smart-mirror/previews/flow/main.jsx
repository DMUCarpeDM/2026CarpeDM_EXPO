import React from "react";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorPreflight } from "../../components/WorkplaceMirrorPreflight";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
import exhibition from "../../../../../../poc/backend/app/seed/workplace-exhibition.json";
import { sessionOverview } from "../../lib/workplaceOverview";
const params = new URLSearchParams(location.search);
const categories = pack.world_setting.workplace_categories;
const firstCategory = params.get("scene") || "morning";
const enabled = exhibition.filter(scene => scene.enabled !== false);
const requested = categories.find(category => category.id === firstCategory);
const selected = enabled.find(scene => requested?.orders.includes(scene.order)) || enabled[0];
const category = categories.find(category => category.orders.includes(selected.order));
const reviewScenes = sessionOverview({
  scenario: pack,
  interaction: { exhibition: true, overview: [{ ...selected, character_id: "park_senior", virtual_time: "", category_id: category.id, opening_line: selected.opening_line, goal: selected.checklist.label }] },
});
function Review() {
  const reviewElapsed = params.get("still") === "1" ? 2500 : null;
  // Review only: no NFC session or camera request is made in this harness.
  return <main><WorkplaceMirrorPreflight reviewScenes={reviewScenes} reviewElapsed={reviewElapsed} consented={true} onNext={() => location.replace(`../simulation/scene.html?scene=${reviewScenes[0].categoryId}`)} /></main>;
}
createRoot(document.getElementById("root")).render(<Review />);
