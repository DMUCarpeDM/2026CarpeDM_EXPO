import { useEffect, useRef, useState } from "react";
import { createVisibleClock } from "../lib/workplaceMirrorTimeline";
import { MirrorCountdownProgress } from "./MirrorCountdownProgress";
import { MirrorGlassModal } from "./MirrorGlassModal";

export function MirrorScenarioBriefing({ briefing, onClose }) {
  const [elapsed, setElapsed] = useState(0);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const clock = createVisibleClock(performance.now(), !document.hidden);
    let completed = false;
    const tick = () => {
      const time = Math.min(5000, clock.tick(performance.now(), !document.hidden));
      setElapsed(Math.floor(time / 1000) * 1000);
      if (time >= 5000 && !completed) { completed = true; close.current?.(); }
    };
    const timer = setInterval(tick, 50);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  return <MirrorGlassModal labelledBy="mirror-briefing-title" describedBy="mirror-briefing-description">
      <div className="overview-card-context">
        <p className="overview-scene-meta"><span className="overview-scene-badge">상황 안내</span>{briefing.step && <span>{briefing.step} / {briefing.total}</span>}</p>
        <h2 id="mirror-briefing-title">{briefing.category_label} 대화 미리보기</h2>
      </div>
      <p id="mirror-briefing-description" className="mirror-briefing-situation">{briefing.situation}</p>
      <p className="mirror-briefing-next">{Math.ceil((5000 - elapsed) / 1000)}초 후 대화 시작</p>
      <MirrorCountdownProgress duration={5000} elapsed={elapsed} label="대화 시작까지 진행" pauseWhenHidden />
  </MirrorGlassModal>;
}
