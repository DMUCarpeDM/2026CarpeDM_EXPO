import { Fragment, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import "../../styles/origin-home-effects.css";

// Independently adapted from the public demos; no OriginKit source is bundled.
// https://www.originkit.dev/components/stagger-text-rise
export function RisingHeadline({ lines }) {
  const reduced = useReducedMotion();
  let wordIndex = 0;

  return (
    <h1 className="origin-headline" aria-label={lines.join(" ")}>
      {lines.map((line) => (
        <span className="origin-headline__line" key={line} aria-hidden="true">
          {line.split(" ").map((word, index) => {
            const delay = wordIndex++ * 0.065;
            return (
              <Fragment key={`${index}-${word}`}>
                {index > 0 && " "}
                <motion.span
                  className="origin-headline__word"
                  initial={reduced ? false : { opacity: 0, y: "65%" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
                >{word}</motion.span>
              </Fragment>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

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
