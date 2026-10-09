import React, { useState } from "react";
import "../backgrounds/ambient.css";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorPreflight } from "../../components/WorkplaceMirrorPreflight";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
import { sessionOverview } from "../../lib/workplaceOverview";
const reviewScenes = sessionOverview({
  scenario: pack,
  interaction: { overview: pack.world_setting.workplace_categories.map((category) => {
    const episode = pack.episodes.find((item) => item.order === category.orders[0]);
    return { ...episode, category_id: category.id, opening_line: episode.initial_question, goal: episode.question_intent };
  }) },
});
function Review() {
  const [started, setStarted] = useState(false);
  const params = new URLSearchParams(location.search);
  const state = params.get("state");
  const backdrop = ["city"].includes(params.get("backdrop")) ? params.get("backdrop") : undefined;
  const reviewElapsed = { morning: 3000, work: 21000, leaving: 39000 }[params.get("scene")] ?? null;
  // Review only: no NFC session or camera request is made in this harness.
  return started ? <main className="mirror-summary scene-slider" style={{justifyContent:"center",textAlign:"center"}}><p>안내 완료 · 자동 전환 확인</p><h1>출근 대화를 시작할 시간이에요.</h1><p>실제 미러에서는 동의한 NFC 카드로 연습 화면에 연결됩니다.</p><small>실제 시나리오 팩 미리보기 · 세션 생성 및 카메라 사용 없음</small></main> : <main className="ambient-preview" data-backdrop={backdrop}>{backdrop && <div className="ambient-backdrop" aria-hidden="true"><i /><i /><i /></div>}<WorkplaceMirrorPreflight reviewScenes={reviewScenes} reviewElapsed={reviewElapsed} consented={state !== "consent"} error={state === "error" ? "서버에 연결하지 못했어요." : undefined} onNext={() => setStarted(true)} /></main>;
}
createRoot(document.getElementById("root")).render(<Review />);
