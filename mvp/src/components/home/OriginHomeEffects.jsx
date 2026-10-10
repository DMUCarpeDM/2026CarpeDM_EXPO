import { Fragment, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import "../../styles/origin-home-effects.css";

// https://www.originkit.dev/components/scroll-text-highlight
// A readable base stays visible while an ink-colored layer follows the scroll.
export function ScrollHighlight({ text }) {
  const target = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start 0.9", "end 0.6"] });
  const words = text.split(" ");

  return (
    <p ref={target} className="origin-scroll-text">
      {reduced ? text : words.map((word, index) => (
        <Fragment key={`${index}-${word}`}>
          {index > 0 && " "}
          <HighlightWord progress={scrollYProgress} start={index / words.length} end={(index + 1) / words.length} word={word} />
        </Fragment>
      ))}
    </p>
  );
}

function HighlightWord({ progress, start, end, word }) {
  const opacity = useTransform(progress, [start, end], [0, 1]);
  return <span className="origin-scroll-word">{word}<motion.span className="origin-scroll-word__ink" style={{ opacity }} aria-hidden="true">{word}</motion.span></span>;
}
