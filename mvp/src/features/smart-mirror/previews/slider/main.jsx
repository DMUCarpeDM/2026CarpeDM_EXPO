import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { workplacePreviewScenes } from "../../data/workplacePreview";
import { createVisibleClock } from "../../lib/workplaceMirrorTimeline";
import "./slider.css";

const images = ["arrival.png", "work.png", "leaving.png"];
const imageAlt = ["출근한 직원이 선임에게 문서를 받는 실버 글래스 장면", "동료와 책상에서 업무 진행 상황을 공유하는 실버 글래스 장면", "퇴근 전 동료에게 내일의 일을 인계하는 실버 글래스 장면"];
const HOLD_MS = 12000;

function SceneSlider() {
  const [elapsed, setElapsed] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    let cancelled = false;
    Promise.all(images.map(name => new Promise(resolve => {
      const image = new Image(); image.onload = resolve; image.onerror = resolve;
      image.src = new URL(`./assets/${name}`, import.meta.url).href;
    }))).then(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!loaded) return undefined;
    const clock = createVisibleClock(performance.now(), !document.hidden);
    const tick = () => setElapsed(clock.tick(performance.now(), !document.hidden));
    const timer = setInterval(tick, 80);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [loaded]);
  const index = Math.floor(elapsed / HOLD_MS) % 3;
  const scene = workplacePreviewScenes[index];
  const progress = elapsed % HOLD_MS / HOLD_MS;
  return <main className="scene-slider" data-scene={index}>
    <header className="slider-brand"><strong>Mirror-Ting</strong><span>직장 대화 · 약 5분</span></header>
    <div className="slider-heading"><p>오늘의 대화 연습</p><h1>회사에서 보내는 하루.</h1><span>출근부터 퇴근까지, 세 장면을 따라가요.</span></div>
    <div className="slider-stage" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false}>
        <motion.article key={index} className="slider-scene" initial={{ opacity: 0, x: reduced ? 0 : "100%" }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : "-100%" }} transition={{ duration: reduced ? .15 : .85, ease: [.22,1,.36,1] }}>
          <figure><img src={new URL(`./assets/${images[index]}`, import.meta.url).href} alt={imageAlt[index]} /><figcaption><span>0{index + 1}</span><strong>{scene.name}</strong><time>{scene.time}</time></figcaption></figure>
          <div className="slider-explanation"><p>{scene.person}과의 대화</p><h2>{scene.title}</h2><blockquote>“{scene.line}”</blockquote><span>{scene.tip}</span></div>
        </motion.article>
      </AnimatePresence>
    </div>
    <footer className="slider-footer"><ol aria-label="장면 안내 진행">{workplacePreviewScenes.map((item, i) => <li key={item.name} aria-current={i === index ? "step" : undefined} className={i === index ? "active" : ""}><div><i style={{ width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%" }} /></div><span>{item.name}</span></li>)}</ol><p>편하게 읽어 주세요. 다음 장면으로 자동으로 넘어가요.</p><small>장면별 이미지 슬라이더 · 검토용 반복 시안</small></footer>
  </main>;
}
createRoot(document.getElementById("root")).render(<SceneSlider />);
