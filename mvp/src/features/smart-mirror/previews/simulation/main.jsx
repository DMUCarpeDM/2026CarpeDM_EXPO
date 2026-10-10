import React, { useState } from "react";
import { MirrorScenarioBriefing } from "../../components/MirrorScenarioBriefing";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorSceneSimulation } from "../../components/WorkplaceMirrorSceneSimulation";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
const params = new URLSearchParams(location.search);
const key = params.get("scene") || "work";
const category = pack.world_setting.workplace_categories.find(item => item.id === key) || pack.world_setting.workplace_categories[1];
const episode = pack.episodes.find(item => item.order === category.orders[0]);
const character = pack.characters.find(item => item.id === episode.character_id);
function PreviewSimulation() {
  const [briefingOpen, setBriefingOpen] = useState(true);
  return <><WorkplaceMirrorSceneSimulation category={category.id} characterId={character.id} name={character.name} videoState="speaking" paused={briefingOpen} dialogueHidden={briefingOpen}>
  <p className="simulation-dialogue-name">{character.name}</p><h1 id="mirror-dialogue-title" className="simulation-dialogue-text">{episode.initial_question}</h1>
</WorkplaceMirrorSceneSimulation>
  {briefingOpen && <MirrorScenarioBriefing briefing={{ category_label: category.label, title: episode.title, situation: episode.situation, tip: episode.question_intent, step: pack.world_setting.workplace_categories.indexOf(category) + 1, total: 3 }} onClose={() => setBriefingOpen(false)} />}
  </>;
}
createRoot(document.getElementById("root")).render(<PreviewSimulation />);
