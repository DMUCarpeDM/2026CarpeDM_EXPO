import { useReducedMotion } from "framer-motion";
import { AnimatedGridPattern } from "../backgrounds/AnimatedGridPattern";

export function FitGridBackground() {
  const reducedMotion = useReducedMotion();
  return (
    <div className="fit-grid-background" aria-hidden="true">
      <AnimatedGridPattern width={56} height={56} numSquares={24} maxOpacity={0.3} duration={4} paused={Boolean(reducedMotion)} className="fit-grid-pattern" />
    </div>
  );
}
