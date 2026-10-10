import { useEffect, useRef, useState } from "react";
import { createVisibleClock } from "../lib/workplaceMirrorTimeline";
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
      setElapsed(time);
      if (time >= 5000 && !completed) { completed = true; close.current?.(); }
    };
    const timer = setInterval(tick, 50);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  return <MirrorGlassModal labelledBy="mirror-briefing-title" describedBy="mirror-briefing-description">
      <div className="overview-card-context">
        <p className="overview-scene-meta"><span className="overview-scene-badge">{briefing.category_label} · 상황 안내</span>{briefing.step && <span>{briefing.step} / {briefing.total}</span>}</p>
        <h2 id="mirror-briefing-title">{briefing.title}</h2>
      </div>
      <p id="mirror-briefing-description" className="mirror-briefing-situation">{briefing.situation}</p>
      {briefing.tip && <p className="mirror-briefing-tip"><strong>연습 목표</strong>{briefing.tip}</p>}
      <p className="mirror-briefing-next">{Math.ceil((5000 - elapsed) / 1000)}초 후 대화가 자동으로 시작돼요.</p>
      <div className="overview-step-track" role="progressbar" aria-label="대화 시작까지 진행" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Math.floor(elapsed / 1000)}>
        <i style={{ transform: `scaleX(${elapsed / 5000})` }} />
      </div>
  </MirrorGlassModal>;
}
