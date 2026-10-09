import React, { lazy, Suspense, useState } from "react";
import "../backgrounds/ambient.css";
import "./review.css";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorPreflight } from "../../components/WorkplaceMirrorPreflight";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
import { sessionOverview } from "../../lib/workplaceOverview";
const PaperBackground = lazy(() => import("../backgrounds/PaperBackground").then((module) => ({ default: module.PaperBackground })));
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
  const backdrop = ["city", "mesh", "dithering"].includes(params.get("backdrop")) ? params.get("backdrop") : undefined;
  const reviewElapsed = { morning: 3000, work: 21000, leaving: 39000 }[params.get("scene")] ?? null;
  // Review only: no NFC session or camera request is made in this harness.
  return started ? <main className="mirror-overview review-complete" aria-labelledby="review-complete-title">
    <header className="overview-masthead"><strong>Mirror-Ting</strong></header>
    <div className="review-complete-content">
      <p className="overview-eyebrow">스마트 미러 안내 미리보기</p>
      <h1 id="review-complete-title">세 장면의 안내가 끝났어요.</h1>
      <p>이 미리보기에서는 대화와 분석이 시작되지 않아요.</p>
      <p>이어서 카드 없이 미러 대화 화면과 예시 대사를 살펴볼 수 있어요.</p>
      <div className="review-complete-actions">
        <button type="button" onClick={() => setStarted(false)}>안내 다시 보기</button>
        <a href="../simulation/4k.html?scene=morning" target="_top">대화 화면 미리보기</a>
      </div>
    </div>
    <footer>실제 시나리오 팩 미리보기 · 세션 생성 및 카메라 사용 없음</footer>
  </main> : <main className="ambient-preview" data-backdrop={backdrop}>{backdrop === "city" && <div className="ambient-backdrop" aria-hidden="true"><i /><i /><i /></div>}{["mesh", "dithering"].includes(backdrop) && <Suspense fallback={null}><PaperBackground variant={backdrop} /></Suspense>}<WorkplaceMirrorPreflight reviewScenes={reviewScenes} reviewElapsed={reviewElapsed} consented={state !== "consent"} error={state === "error" ? "서버에 연결하지 못했어요." : undefined} onNext={() => setStarted(true)} /></main>;
}
createRoot(document.getElementById("root")).render(<Review />);
