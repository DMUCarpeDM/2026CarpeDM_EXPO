import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

// Load the GPU material only when the overview is displayed; HTML remains readable while it loads.
const GlassMaterial = lazy(() => import("./OverviewGlassMaterial"));

export function WorkplaceOverviewCard({ scene }) {
  const surface = useRef(null);
  const [render, setRender] = useState("fallback");
  const [shape, setShape] = useState({ type: "roundedRectSDF", width: .45, height: .49, rounding: .045 });
  const ready = useCallback(() => setRender("webgpu"), []);
  const unavailable = useCallback(() => setRender("unavailable"), []);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const radius = parseFloat(getComputedStyle(surface.current).borderRadius);
      const inset = radius * .15;
      setShape({ type: "roundedRectSDF", width: (width / 2 - inset) / height, height: .5 - inset / height, rounding: (radius - inset) / height });
    });
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, []);
  return <section ref={surface} className="overview-summary-card" data-render={render} aria-labelledby="overview-situation-title">
    {render !== "unavailable" && <Suspense fallback={null}><GlassMaterial shape={shape} onReady={ready} onUnavailable={unavailable} /></Suspense>}
    <div className="overview-card-content" aria-live="polite" aria-atomic="true">
      <div className="overview-card-context">
        <p className="overview-scene-meta"><span className="overview-scene-badge">{scene.name}</span><time>{scene.time}</time></p>
        <h2 id="overview-situation-title">{scene.situation}</h2>
      </div>
      <div className="overview-card-details">
        <dl className="overview-partner"><div><dt>대화 상대</dt><dd>{scene.person}</dd></div></dl>
        <div className="overview-goal"><span>연습 목표</span><p>{scene.tip}</p></div>
      </div>
    </div>
  </section>;
}
