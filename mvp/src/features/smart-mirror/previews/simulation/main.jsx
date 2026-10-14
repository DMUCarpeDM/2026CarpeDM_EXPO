import React from "react";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorSceneSimulation } from "../../components/WorkplaceMirrorSceneSimulation";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
import exhibition from "../../../../../../poc/backend/app/seed/workplace-exhibition.json";
const params = new URLSearchParams(location.search);
const key = params.get("scene") || "work";
const category = pack.world_setting.workplace_categories.find(item => item.id === key) || pack.world_setting.workplace_categories[1];
const selected = exhibition.find(scene => category.orders.includes(scene.order));
const episode = pack.episodes.find(item => item.order === selected.order);
const character = pack.characters.find(item => item.id === episode.character_id);
function PreviewSimulation() {
  return <WorkplaceMirrorSceneSimulation dialogue={episode.initial_question} category={category.id} characterId={character.id} name={character.name} videoState="speaking" />;
}
createRoot(document.getElementById("root")).render(<PreviewSimulation />);
