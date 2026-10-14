import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import conversation from "../assets/overview-conversation.png";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-city.css";

// Session preparation, consent and automatic navigation stay in the preflight controller.
export function WorkplaceMirrorOverview({ scenes, phase, progress, starting, paused, onPause, onScene, onStart }) {
  const scene = scenes[phase.scene];
  const countdown = phase.kind === "countdown";
  const finishing = starting || phase.kind === "complete";
  return <section className="mirror-overview mirror-city-surface" aria-labelledby="overview-title" data-scene={phase.scene} data-starting={countdown || finishing} data-glass={new URLSearchParams(window.location.search).get("glass") === "bright" ? "bright" : "standard"}>
    <div className="overview-top-progress" role="progressbar" aria-label="대화 시작까지 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <i style={{ transform: `scaleX(${progress})` }} />
    </div>
    <div className="overview-content">
      <div className="overview-context">
        <h1 id="overview-title">오늘의 대화</h1>
        <p className="overview-intro">상황을 살펴보고, 평소처럼 대화해 보세요.</p>
      </div>
      <div className="overview-art" aria-hidden="true">
        <img src={conversation} alt="" />
      </div>
      <WorkplaceOverviewCard scene={scene} live="polite" />
    </div>
    <footer className="overview-footer">
      {(countdown || finishing) && <p role="status">{finishing ? "대화를 준비하고 있어요." : `${phase.remaining}초 후 대화가 시작돼요.`}</p>}
    {onPause && !finishing && <div className="overview-playback"><button type="button" onClick={onPause}>{paused ? "자동 안내 재개" : "자동 안내 일시정지"}</button>{paused && <><button type="button" disabled={phase.scene === 0} onClick={() => onScene(phase.scene - 1)}>이전 장면</button><button type="button" onClick={() => phase.scene < scenes.length - 1 ? onScene(phase.scene + 1) : onStart()}>{phase.scene < scenes.length - 1 ? "다음 장면" : "대화 시작"}</button></>}</div>}</footer>
  </section>;
}
