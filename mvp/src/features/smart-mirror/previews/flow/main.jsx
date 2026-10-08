import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkplaceMirrorPreflight } from "../../components/WorkplaceMirrorPreflight";
function Review() {
  const [started, setStarted] = useState(false);
  const state = new URLSearchParams(location.search).get("state");
  // Review only: no NFC session or camera request is made in this harness.
  return started ? <main className="mirror-summary scene-slider" style={{justifyContent:"center",textAlign:"center"}}><p>안내 완료 · 자동 전환 확인</p><h1>출근 대화를 시작할 시간이에요.</h1><p>실제 미러에서는 동의한 NFC 카드로 연습 화면에 연결됩니다.</p><small>검토용 화면 · 카메라 및 마이크 사용 없음</small></main> : <main><WorkplaceMirrorPreflight consented={state !== "consent"} error={state === "error" ? "서버에 연결하지 못했어요." : undefined} onNext={() => setStarted(true)} /></main>;
}
createRoot(document.getElementById("root")).render(<Review />);
