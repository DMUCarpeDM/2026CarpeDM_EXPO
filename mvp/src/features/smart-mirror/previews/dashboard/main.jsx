import React from "react";
import { createRoot } from "react-dom/client";
import "../../../../styles.css";
import { ResultPage } from "../../../../pages/ResultPage";

// Isolated layout fixture. Production receives only the session report from ResultPage.
const example = {
  total_score: 76,
  fit_scores: { response: { score: 82 }, voice: { score: 74 }, expression: { score: 68, provisional: true }, posture: { score: 80 } },
  strengths: ["상대의 요청을 확인하고, 가능한 작업 범위를 구체적으로 설명했어요."],
  improvements: ["처음 하는 업무라면 마감 전에 확인할 항목을 먼저 합의해 보세요."],
  coaching: [{ quote: "처음 해보는 일이라 시간이 좀 걸릴 것 같습니다.", suggestion: "우선 자료를 검토하고 3시까지 초안을 공유하겠습니다. 확인이 필요한 부분은 그때 여쭤봐도 될까요?" }],
  speech_stats: { turns: 6, measurement: { audio_sec: 128 } },
};
const state = new URLSearchParams(location.search).get("state");
const report = state === "loading" || state === "error" ? null : state === "empty" ? {} : example;
createRoot(document.getElementById("root")).render(<>
  <ResultPage mirror report={report} progress={{ pct: 42 }} error={state === "error" ? "분석을 불러오지 못했어요. 운영자에게 도움을 요청해 주세요." : null} />
  <div className="dashboard-preview-notice" style={{position:"fixed",bottom:0,left:0,right:0,textAlign:"center",color:"#c6cdd8",fontSize:"max(13px, 1vh)",background:"#000c",padding:".4vh"}}>레이아웃 미리보기 · 예시 데이터 · 실제 분석 결과가 아닙니다</div>
</>);
