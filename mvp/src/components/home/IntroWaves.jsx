import { useEffect, useRef, useState } from "react";

export function IntroWaves() {
  const root = useRef(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let intersecting = false;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; update(); });
    observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  return <>
    <div ref={root} className="intro-waves" data-running={visible && !paused} aria-hidden="true">
      <svg viewBox="0 0 900 800" preserveAspectRatio="none" focusable="false">
        <g>{Array.from({ length: 108 }, (_, index) => {
          const x = index * 16 - 406;
          return <path key={index} vectorEffect="non-scaling-stroke" d={`M ${x} -120 C ${x - 400} 180, ${x + 400} 450, ${x - 20} 920`} />;
        })}</g>
      </svg>
    </div>
    <button className="intro-waves-toggle" type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "배경 움직임 재생" : "배경 움직임 멈추기"}</button>
  </>;
}
