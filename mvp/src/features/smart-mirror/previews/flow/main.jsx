import React from "react";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorPreflight } from "../../components/WorkplaceMirrorPreflight";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
import { MIRROR_SCENE_MS } from "../../lib/workplaceMirrorTimeline";
import { sessionOverview } from "../../lib/workplaceOverview";
const reviewScenes = sessionOverview({
  scenario: pack,
  interaction: { overview: pack.world_setting.workplace_categories.map((category) => {
    const episode = pack.episodes.find((item) => item.order === category.orders[0]);
    return { ...episode, category_id: category.id, opening_line: episode.initial_question, goal: episode.question_intent };
  }) },
});
function Review() {
  const params = new URLSearchParams(location.search);
  const state = params.get("state");
  const sceneElapsed = { morning: 3000, work: MIRROR_SCENE_MS + 3000, leaving: MIRROR_SCENE_MS * 2 + 3000 }[params.get("scene")] ?? 0;
  const reviewElapsed = params.get("still") === "1" ? sceneElapsed : null;
  // Review only: no NFC session or camera request is made in this harness.
  return <main><WorkplaceMirrorPreflight reviewScenes={reviewScenes} reviewElapsed={reviewElapsed} reviewStartElapsed={sceneElapsed} consented={state !== "consent"} error={state === "error" ? "서버에 연결하지 못했어요." : undefined} onNext={() => location.replace("../simulation/scene.html?scene=morning")} /></main>;
}
createRoot(document.getElementById("root")).render(<Review />);
