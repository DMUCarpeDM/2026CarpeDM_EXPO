import React from "react";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorSceneSimulation } from "../../components/WorkplaceMirrorSceneSimulation";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
const key = new URLSearchParams(location.search).get("scene") || "work";
const category = pack.world_setting.workplace_categories.find(item => item.id === key) || pack.world_setting.workplace_categories[1];
const episode = pack.episodes.find(item => item.order === category.orders[0]);
const character = pack.characters.find(item => item.id === episode.character_id);
createRoot(document.getElementById("root")).render(<WorkplaceMirrorSceneSimulation category={category.id} characterId={character.id} name={character.name} videoState="speaking">
  <p className="simulation-dialogue-name">{character.name}</p><h1 id="mirror-dialogue-title" className="simulation-dialogue-text">{episode.initial_question}</h1>
</WorkplaceMirrorSceneSimulation>);
