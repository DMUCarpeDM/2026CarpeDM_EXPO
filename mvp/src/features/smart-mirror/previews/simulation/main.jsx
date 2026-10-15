import React from "react";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorSceneSimulation } from "../../components/WorkplaceMirrorSceneSimulation";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
import exhibition from "../../../../../../poc/backend/app/seed/workplace-exhibition.json";
const params = new URLSearchParams(location.search);
const key = params.get("scene") || "work";
const categories = pack.world_setting.workplace_categories;
const enabled = exhibition.filter(scene => scene.enabled !== false);
const requested = categories.find(item => item.id === key);
const selected = enabled.find(scene => requested?.orders.includes(scene.order)) || enabled[0];
const category = categories.find(item => item.orders.includes(selected.order));
const episode = pack.episodes.find(item => item.order === selected.order);
const character = pack.characters.find(item => item.id === episode.character_id);
function PreviewSimulation() {
  return <WorkplaceMirrorSceneSimulation dialogue={selected.opening_line} category={category.id} characterId={character.id} name={character.name} videoState="speaking" />;
}
createRoot(document.getElementById("root")).render(<PreviewSimulation />);
