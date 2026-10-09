import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { WorkplaceMirrorOverview } from "./WorkplaceMirrorOverview";
import arrival from "../assets/arrival.png";
import work from "../assets/work.png";
import leaving from "../assets/leaving.png";

const images = [arrival, work, leaving];
const imageAlt = ["출근한 직원이 선임에게 문서를 받는 실버 글래스 장면", "업무 자리에서 상사와 업무 내용을 확인하는 실버 글래스 장면", "사무실 출구에서 동료와 퇴근 전 대화하는 실버 글래스 장면"];
import { overviewCategories, sessionOverview } from "../lib/workplaceOverview";
import { createVisibleClock, mirrorPhase, MIRROR_OVERVIEW_MS, MIRROR_SCENE_MS } from "../lib/workplaceMirrorTimeline";
import "../styles/workplace-mirror-flow.css";

export function WorkplaceMirrorPreflight({ mode = 5, consented, starting, onNext, error, onConsent, externalCard = false, onPrepare, reviewScenes = null, reviewElapsed = null }) {
  const [elapsed, setElapsed] = useState(reviewElapsed ?? 0);
  const [scenes, setScenes] = useState(reviewScenes);
  const [preparationError, setPreparationError] = useState("");
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
  }, [consented, reviewScenes]);
  const [visible, setVisible] = useState(!document.hidden);
  const started = useRef(false);
  const next = useRef(onNext);
  next.current = onNext;
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [manualPlay, setManualPlay] = useState(false);
  const stopped = paused || (reduced && !manualPlay);
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
  const index = Math.max(0, phase.scene);
  const scene = scenes?.[index] || overviewCategories[index];
  const blocked = !consented || currentError;
  const sceneProgress = Math.max(0, Math.min(1, phase.progress || 0));
  if (scenes && !blocked) return <WorkplaceMirrorOverview scenes={scenes} phase={phase} mode={mode} starting={starting} reduced={reduced} paused={stopped} onPause={reviewElapsed === null ? () => { setPaused(!stopped); setManualPlay(true); } : undefined} onScene={index => setElapsed(index * MIRROR_SCENE_MS)} onStart={() => { if (!started.current) { started.current = true; next.current?.(); } }} />;
  return <section className="mirror-summary scene-slider" aria-labelledby="mirror-summary-title" data-glass={new URLSearchParams(window.location.search).get("glass") === "bright" ? "bright" : "standard"} data-phase={phase.kind} data-scene={index}>
    <header className="slider-brand"><strong>Mirror-Ting</strong><span>직장 대화 · 약 {mode}분</span></header>
    <div className="slider-heading"><p>오늘의 대화 연습</p><h1 id="mirror-summary-title">회사에서 보내는 하루.</h1><span>출근부터 퇴근까지, 세 장면을 따라가요.</span></div>
    <div className="slider-stage" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false}>
        <motion.article key={index} className="slider-scene" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}>
          <figure><img src={images[index]} alt={imageAlt[index]} /><figcaption><span>0{index + 1}</span><strong>{scene.name}</strong><time>{scene.time}</time></figcaption></figure>
          <div className="slider-explanation">
            {blocked ? <><p className="mirror-card-eyebrow">운영자 확인</p><h2>{currentError ? "연습을 준비하지 못했어요." : externalCard ? "분석과 결과 처리에 동의해 주세요." : "키오스크에서 먼저 동의해 주세요."}</h2><p className="mirror-scene-tip">{currentError ? `${currentError} 운영자에게 준비 상태를 확인해 달라고 요청해 주세요.` : externalCard ? "동의하면 하루 안내가 자동으로 시작돼요." : "동의 후 발급한 카드를 다시 태그해 주세요."}</p>{externalCard && !currentError && <label className="consent-check"><input type="checkbox" checked={consented} onChange={(event) => onConsent(event.target.checked)} /><span>카메라·음성 분석과 결과 처리에 동의해요. AI 상대 음성은 외부 음성 서비스를 사용할 수 있고, 연습 음성과 결과는 이 브라우저에 보관되며 서버에서도 세션·기록을 처리해요.</span></label>}</> : !scenes ? <><p>시나리오 준비 중</p><h2>오늘 만날 대화를 불러오고 있어요.</h2><span>준비가 끝나면 세 장면의 안내가 자동으로 시작돼요.</span></> : <><p>{scene.person}과의 대화</p><h2>{scene.title}</h2><p className="mirror-scene-situation">{scene.situation}</p><blockquote>“{scene.line}”</blockquote><span>{scene.tip}</span></>}
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
    <footer className="slider-footer"><ol aria-label="장면 안내 진행">{(scenes || overviewCategories).map((item, i) => <li key={item.name} aria-current={phase.scene === i ? "step" : undefined} className={phase.scene === i ? "active" : ""}><div><i style={{transform: `scaleX(${i < index ? 1 : i === index && phase.scene >= 0 ? sceneProgress : 0})`}} /></div><span>{item.name}</span></li>)}</ol><p>{blocked ? "운영자에게 도움을 요청해 주세요." : !scenes ? "시나리오를 준비하고 있어요." : starting || phase.kind === "complete" ? "출근 대화를 준비하고 있어요." : phase.kind === "countdown" ? `${phase.remaining}초 후 출근 대화가 시작돼요.` : "편하게 읽어 주세요. 다음 장면으로 자동으로 넘어가요."}</p><div className="mirror-total-progress" role="progressbar" aria-label="하루 안내 진행" aria-valuemin={0} aria-valuemax={MIRROR_OVERVIEW_MS / 1000} aria-valuenow={Math.floor(elapsed / 1000)}><i style={{transform: `scaleX(${elapsed / MIRROR_OVERVIEW_MS})`}} /></div></footer>
  </section>;
}
