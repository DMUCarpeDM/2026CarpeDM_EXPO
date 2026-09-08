import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/home/HomeMotion.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/home-motion.css", import.meta.url), "utf8");

test("Home motion skips the hero, reveals once and caps stagger delay", () => {
  assert.match(source, /container\.children\)\.slice\(1\)/);
  assert.match(source, /!revealed\.has\(element\)/);
  assert.match(source, /Math\.min\(index \* 0\.08, 0\.24\)/);
  assert.match(source, /duration: 0\.5, delay: 0\.25 \+ Number\(element\.dataset\.homeDelay \|\| 0\)/);
});

test("Home motion cleans up observers and respects reduced motion and focus", () => {
  assert.match(source, /if \(!container \|\| reduced\) return/);
  assert.match(source, /cleanups\.forEach\(\(stop\) => stop\(\)\)/);
  assert.match(source, /container\.removeEventListener\("focusin", onFocus\)/);
  assert.match(source, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /home-reveal-target:focus-within/);
});

test("Footer falls back to document flow when it cannot fit and stacks on mobile", () => {
  assert.match(source, /element\.offsetHeight < window\.innerHeight - 100/);
  assert.match(source, /fits && !reduced/);
  assert.match(styles, /@media \(max-width: 599px\)/);
  assert.match(styles, /grid-template-columns: 1fr/);
  assert.doesNotMatch(source, /href="#"/);
});
