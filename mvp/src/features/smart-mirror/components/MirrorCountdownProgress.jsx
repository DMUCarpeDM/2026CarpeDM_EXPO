import { useEffect, useRef } from "react";

// The fill runs on the compositor; React only updates the accessible seconds.
export function MirrorCountdownProgress({ duration, elapsed, label, pauseWhenHidden = false }) {
  const fill = useRef(null);
  const elapsedTime = useRef(elapsed);
  elapsedTime.current = elapsed;
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let animation;
    const visibility = () => {
      if (pauseWhenHidden && document.hidden) animation?.pause();
      else animation?.play();
    };
    const configure = () => {
      const currentTime = animation?.currentTime ?? elapsedTime.current;
      animation?.cancel();
      animation = undefined;
      if (!motion.matches) {
        animation = fill.current.animate(
          [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
          { duration, easing: "linear", fill: "forwards" },
        );
        animation.currentTime = currentTime;
        visibility();
      }
    };
    configure();
    motion.addEventListener("change", configure);
    if (pauseWhenHidden) document.addEventListener("visibilitychange", visibility);
    return () => {
      animation?.cancel();
      motion.removeEventListener("change", configure);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [duration, pauseWhenHidden]);
  return <div className="overview-step-track mirror-countdown-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={duration / 1000} aria-valuenow={elapsed / 1000}>
    <i ref={fill} style={{ transform: `scaleX(${elapsed / duration})` }} />
  </div>;
}
