import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { AnimatedGridPattern } from "../backgrounds/AnimatedGridPattern";

export function FitGridBackground() {
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  return (
    <>
      <div className="fit-grid-background" aria-hidden="true">
        <AnimatedGridPattern width={56} height={56} numSquares={24} maxOpacity={0.3} duration={4} paused={paused || reducedMotion} className="fit-grid-pattern" />
      </div>
      {!reducedMotion && <button type="button" className="fit-grid-toggle" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "배경 재생" : "배경 정지"}</button>}
    </>
  );
}
