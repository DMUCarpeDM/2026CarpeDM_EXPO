import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { WorkplaceMirrorOverview } from "./WorkplaceMirrorOverview";
import { sessionOverview } from "../lib/workplaceOverview";
import { createVisibleClock, mirrorPhase, MIRROR_OVERVIEW_MS, MIRROR_SCENE_MS } from "../lib/workplaceMirrorTimeline";
import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import "../styles/workplace-mirror-nfc.css";

export function WorkplaceMirrorPreflight({ mode = 5, consented, starting, onNext, error, onPrepare, reviewScenes = null, reviewElapsed = null, reviewStartElapsed = 0 }) {
  const [elapsed, setElapsed] = useState(reviewElapsed ?? reviewStartElapsed);
  const [scenes, setScenes] = useState(reviewScenes);
  const [preparationError, setPreparationError] = useState("");
  const [retry, setRetry] = useState(0);
  const preparation = useRef(null);
  const prepare = useRef(onPrepare);
  prepare.current = onPrepare;
  const currentError = error || preparationError;
  useEffect(() => {
    if (reviewScenes) return undefined;
    if (!consented) { setScenes(null); setElapsed(0); setPreparationError(""); preparation.current = null; return undefined; }
    let cancelled = false;
    if (!preparation.current) preparation.current = Promise.resolve().then(() => prepare.current?.());
    preparation.current.then((session) => {
      if (!cancelled) setScenes(sessionOverview(session));
    }).catch((failure) => {
      if (!cancelled) setPreparationError(failure.message);
    });
    return () => { cancelled = true; };
  }, [consented, reviewScenes, retry]);
  const [visible, setVisible] = useState(!document.hidden);
  const started = useRef(false);
  const next = useRef(onNext);
  next.current = onNext;
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const stopped = paused;
  const currentElapsed = useRef(elapsed);
  currentElapsed.current = elapsed;
  useEffect(() => {
    if (reviewElapsed !== null || !consented || currentError || !scenes || stopped) return undefined;
    const offset = currentElapsed.current;
    const clock = createVisibleClock(performance.now(), !document.hidden);
    const tick = () => {
      setVisible(!document.hidden);
      setElapsed(Math.min(MIRROR_OVERVIEW_MS, offset + clock.tick(performance.now(), !document.hidden)));
    };
    const timer = setInterval(tick, 80);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [consented, currentError, scenes, reviewElapsed, stopped]);
  useEffect(() => {
    if (elapsed < MIRROR_OVERVIEW_MS || !consented || currentError || !scenes || starting || started.current || !visible || stopped) return;
    started.current = true;
    next.current?.();
  }, [elapsed, consented, currentError, scenes, starting, visible, stopped]);
  const phase = mirrorPhase(elapsed);
  const blocked = !consented || currentError;
  if (scenes && !blocked) return <WorkplaceMirrorOverview scenes={scenes} phase={phase} mode={mode} starting={starting} reduced={reduced} paused={stopped} onPause={reviewElapsed === null ? () => setPaused(value => !value) : undefined} onScene={index => setElapsed(index * MIRROR_SCENE_MS)} onStart={() => { if (!started.current) { started.current = true; next.current?.(); } }} />;
  return <section className="mirror-nfc-waiting mirror-city-surface" aria-busy={!currentError} aria-labelledby="mirror-preparation-title">
    <header className="overview-masthead"><strong>Mirror-Ting</strong></header>
    <div className="mirror-nfc-content">
      <WorkplaceOverviewCard labelledBy="mirror-preparation-title" live="polite">
        <h1 id="mirror-preparation-title">{currentError ? "연결 상태를 확인해 주세요." : "오늘의 대화를 준비하고 있어요."}</h1>
        {currentError && <p role="alert" className="mirror-nfc-instruction">{currentError}</p>}
        {currentError && <button type="button" className="mirror-start-retry" disabled={starting} onClick={() => {
          preparation.current = null;
          started.current = false;
          setPreparationError(""); setScenes(null); setElapsed(0); setRetry(value => value + 1);
        }}>장치 연결 후 다시 시작</button>}
      </WorkplaceOverviewCard>
    </div>
  </section>;
}
