import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import arrival from "../assets/arrival.png";
import work from "../assets/work.png";
import leaving from "../assets/leaving.png";

const images = [arrival, work, leaving];
const imageAlt = ["출근한 직원이 선임에게 문서를 받는 실버 글래스 장면", "동료와 책상에서 업무 진행 상황을 공유하는 실버 글래스 장면", "퇴근 전 동료에게 내일의 일을 인계하는 실버 글래스 장면"];
import { workplacePreviewScenes } from "../data/workplacePreview";
import { createVisibleClock, mirrorPhase, MIRROR_OVERVIEW_MS } from "../lib/workplaceMirrorTimeline";
import "../styles/workplace-mirror-flow.css";

export function WorkplaceMirrorPreflight({ mode = 5, consented, starting, onNext, error, onConsent, externalCard = false }) {
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
  const sceneProgress = Math.max(0, Math.min(1, phase.progress || 0));
  return <section className="mirror-summary scene-slider" aria-labelledby="mirror-summary-title" data-glass={new URLSearchParams(window.location.search).get("glass") === "bright" ? "bright" : "standard"} data-phase={phase.kind} data-scene={index}>
    <header className="slider-brand"><strong>Mirror-Ting</strong><span>직장 대화 · 약 {mode}분</span></header>
    <div className="slider-heading"><p>오늘의 대화 연습</p><h1 id="mirror-summary-title">회사에서 보내는 하루.</h1><span>출근부터 퇴근까지, 세 장면을 따라가요.</span></div>
    <div className="slider-stage" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false}>
        <motion.article key={index} className="slider-scene" initial={{ opacity: 0, x: reduced ? 0 : "100%" }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : "-100%" }} transition={{ duration: reduced ? .15 : .85, ease: [.22,1,.36,1] }}>
          <figure><img src={images[index]} alt={imageAlt[index]} /><figcaption><span>0{index + 1}</span><strong>{scene.name}</strong><time>{scene.time}</time></figcaption></figure>
          <div className="slider-explanation">
            {blocked ? <><p className="mirror-card-eyebrow">운영자 확인</p><h2>{error ? "연습을 준비하지 못했어요." : externalCard ? "분석과 결과 처리에 동의해 주세요." : "키오스크에서 먼저 동의해 주세요."}</h2><p className="mirror-scene-tip">{error ? `${error} 운영자에게 준비 상태를 확인해 달라고 요청해 주세요.` : externalCard ? "동의하면 하루 안내가 자동으로 시작돼요." : "동의 후 발급한 카드를 다시 태그해 주세요."}</p>{externalCard && !error && <label className="consent-check"><input type="checkbox" checked={consented} onChange={(event) => onConsent(event.target.checked)} /><span>카메라·음성 분석과 결과 처리에 동의해요. AI 상대 음성은 외부 음성 서비스를 사용할 수 있고, 연습 음성과 결과는 이 브라우저에 보관되며 서버에서도 세션·기록을 처리해요.</span></label>}</> : <><p>{scene.person}과의 대화</p><h2>{scene.title}</h2><blockquote>“{scene.line}”</blockquote><span>{scene.tip}</span></>}
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
    <footer className="slider-footer"><ol aria-label="장면 안내 진행">{workplacePreviewScenes.map((item, i) => <li key={item.name} aria-current={phase.scene === i ? "step" : undefined} className={phase.scene === i ? "active" : ""}><div><i style={{width: i < index ? "100%" : i === index && phase.scene >= 0 ? `${sceneProgress * 100}%` : "0%"}} /></div><span>{item.name}</span></li>)}</ol><p>{blocked ? "운영자에게 도움을 요청해 주세요." : starting || phase.kind === "complete" ? "출근 대화를 준비하고 있어요." : phase.kind === "countdown" ? `${phase.remaining}초 후 출근 대화가 시작돼요.` : "편하게 읽어 주세요. 다음 장면으로 자동으로 넘어가요."}</p><div className="mirror-total-progress" role="progressbar" aria-label="하루 안내 진행" aria-valuemin={0} aria-valuemax={43} aria-valuenow={Math.floor(elapsed / 1000)}><i style={{width:`${elapsed / MIRROR_OVERVIEW_MS * 100}%`}} /></div></footer>
  </section>;
}
