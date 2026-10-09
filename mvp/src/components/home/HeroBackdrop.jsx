import { useEffect, useRef } from "react";
import { motion, useMotionTemplate, useSpring } from "framer-motion";
import "../../styles/hero-backdrop.css";

export function HeroBackdrop() {
  const root = useRef(null);
  const x = useSpring(0, { duration: 0.5, bounce: 0.2 });
  const y = useSpring(0, { duration: 0.5, bounce: 0.2 });
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

  useEffect(() => {
    const backdrop = root.current;
    const hero = backdrop.parentElement;
    const enabled = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let active = false;
    const hide = () => {
      active = false;
      backdrop.removeAttribute("data-active");
      x.jump(x.get());
      y.jump(y.get());
    };
    const move = (event) => {
      if (!enabled.matches || event.pointerType !== "mouse") return;
      const bounds = backdrop.getBoundingClientRect();
      const nextX = event.clientX - bounds.left;
      const nextY = event.clientY - bounds.top;
      if (!active) {
        x.jump(nextX);
        y.jump(nextY);
      } else {
        x.set(nextX);
        y.set(nextY);
      }
      active = true;
      backdrop.dataset.active = "true";
    };
    hero.addEventListener("pointermove", move);
    hero.addEventListener("pointerleave", hide);
    window.addEventListener("keydown", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, { passive: true });
    enabled.addEventListener("change", hide);
    return () => {
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", hide);
      window.removeEventListener("keydown", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide);
      enabled.removeEventListener("change", hide);
      hide();
    };
  }, [x, y]);

  return (
    <div ref={root} className="hero-backdrop" aria-hidden="true">
      <motion.div className="hero-backdrop__light" style={{ transform }} />
    </div>
  );
}
