import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/home/HomeMotion.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/home-motion.css", import.meta.url), "utf8");

test("Home motion skips the hero, reveals once and caps stagger delay", () => {
  assert.match(source, /container\.children\)\.slice\(1\)/);
  assert.match(source, /!revealed\.has\(element\)/);
  assert.match(source, /Math\.min\(index \* 0\.04, 0\.12\)/);
  assert.match(source, /duration: 0\.24, delay: Number\(element\.dataset\.homeDelay \|\| 0\)/);
});

test("Home motion cleans up observers and respects reduced motion and focus", () => {
  assert.match(source, /if \(!container \|\| reduced\) return/);
  assert.match(source, /cleanups\.forEach\(\(stop\) => stop\(\)\)/);
  assert.match(source, /container\.removeEventListener\("focusin", onFocus\)/);
  assert.match(source, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /home-reveal-target:focus-within/);
});

test("Footer uses document flow, a large brand signature and responsive navigation", () => {
  assert.doesNotMatch(source, /home-site-footer--reveal|setFits/);
  assert.match(source, /home-site-footer__signature/);
  assert.match(source, /\/icons\/mirror-ting-mark-slim\.png/);
  assert.match(source, /onClick=\{onNext\}/);
  assert.match(source, /onClick=\{onModeSelect\}/);
  assert.match(styles, /@media \(max-width: 800px\)/);
  assert.match(styles, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /font-size: 16cqi/);
  assert.doesNotMatch(source, /href="#"/);
});
