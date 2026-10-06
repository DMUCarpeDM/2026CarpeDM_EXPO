import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { WorkplacePixelOffice, pixelOfficeScenes } from "./WorkplacePixelOffice";
import { workplacePreviewScenes } from "../data/workplacePreview";
import { createVisibleClock, mirrorPhase, MIRROR_OVERVIEW_MS } from "../lib/workplaceMirrorTimeline";
import "../styles/workplace-mirror-flow.css";

export function WorkplaceMirrorPreflight({ mode = 5, consented, starting, onNext, error }) {
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);
  const started = useRef(false);
  const next = useRef(onNext);
  next.current = onNext;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!consented || error) return undefined;
    const clock = createVisibleClock(performance.now(), !document.hidden);
    const tick = () => {
      setVisible(!document.hidden);
      setElapsed(Math.min(MIRROR_OVERVIEW_MS, clock.tick(performance.now(), !document.hidden)));
    };
    const timer = setInterval(tick, 80);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [consented, error]);
  useEffect(() => {
    if (elapsed < MIRROR_OVERVIEW_MS || !consented || error || starting || started.current || !visible) return;
    started.current = true;
    next.current?.();
  }, [elapsed, consented, error, starting, visible]);
  const phase = mirrorPhase(elapsed);
  const index = Math.max(0, phase.scene);
  const scene = workplacePreviewScenes[index];
  const blocked = !consented || error;
  return <section className="mirror-summary" aria-labelledby="mirror-summary-title" data-glass={new URLSearchParams(window.location.search).get("glass") === "bright" ? "bright" : "standard"} data-phase={phase.kind} data-scene={index} style={{ "--mirror-scene-image": `url(${pixelOfficeScenes[index].background})` }}>
    <header className="mirror-summary-brand"><strong>Mirror-Ting</strong><span>직장 대화 · 약 {mode}분</span></header>
    <div className="mirror-summary-heading"><p>하루의 흐름</p><h1 id="mirror-summary-title">회사에서 보내는 하루.</h1><span>출근부터 퇴근까지, 상황에 맞춰 대화해요.</span></div>
    <WorkplacePixelOffice phase={phase} reduced={reduced} blocked={Boolean(blocked)} visible={visible} />
    <ol className="mirror-day-progress" aria-label="출근, 업무, 퇴근 순서로 자동 안내">
      {workplacePreviewScenes.map((item, i) => <li key={item.name} aria-current={phase.scene === i ? "step" : undefined} className={phase.scene === i ? "is-current" : ""}><span>0{i + 1}</span><strong>{item.name}</strong><small>{item.time}</small></li>)}
    </ol>
    <div className="mirror-scene-area" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false} mode="wait">
        <motion.article key={blocked ? "blocked" : phase.scene < 0 ? "overview" : index} className="mirror-scene-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }}>
          {blocked ? <><p className="mirror-card-eyebrow">운영자 확인</p><h2>{error ? "연습을 준비하지 못했어요." : "키오스크에서 먼저 동의해 주세요."}</h2><p className="mirror-scene-tip">{error ? `${error} 운영자에게 준비 상태를 확인해 달라고 요청해 주세요.` : "동의 후 발급한 카드를 다시 태그해 주세요."}</p></> : phase.scene < 0 ? <><p className="mirror-card-eyebrow">세 가지 장면 · 자동 안내</p><h2>오늘 만날 대화를 살펴볼게요.</h2><p className="mirror-scene-tip">안내가 끝나면 출근 대화가 시작돼요.</p></> : <><p className="mirror-card-eyebrow">0{index + 1} · {scene.time} · {scene.person}</p><h2>{scene.title}</h2><blockquote>“{scene.line}”</blockquote><p className="mirror-scene-tip">{scene.tip}</p></>}
        </motion.article>
      </AnimatePresence>
    </div>
    <footer className="mirror-summary-footer"><p>{blocked ? "운영자에게 도움을 요청해 주세요." : starting || phase.kind === "complete" ? "출근 대화를 준비하고 있어요." : phase.kind === "countdown" ? `${phase.remaining}초 후 출근 대화가 시작돼요.` : "편하게 읽어 주세요. 다음 장면으로 자동 이동해요."}</p><div className="mirror-total-progress" role="progressbar" aria-label="하루 안내 진행" aria-valuemin={0} aria-valuemax={43} aria-valuenow={Math.floor(elapsed / 1000)}><i style={{ width: `${elapsed / MIRROR_OVERVIEW_MS * 100}%` }} /></div></footer>
  </section>;
}
