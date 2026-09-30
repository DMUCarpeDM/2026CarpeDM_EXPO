import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LockKeyhole } from "reicon-react/icons/LockKeyhole";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { IconGlyph } from "./ui/IconGlyph";

/** 전시 어트랙트 루프 — 홈 화면에서 일정 시간 조작이 없으면 가치 제안 슬라이드를
 *  순환하며 관람객의 발길을 잡는다. 전환을 멈추거나 메인으로 돌아갈 수 있다.
 *  대기 시간은 ?attract=<초>로 조정할 수 있다 (전시 운영·검증용). */
const IDLE_MS = 45_000;
const SLIDE_MS = 4_600;

function idleDelayMs() {
  const seconds = Number(new URLSearchParams(window.location.search).get("attract"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : IDLE_MS;
}

const SLIDES = [
  {
    key: "roleplay",
    icon: <Sparkles size={46} />,
    title: "중요한 대화 전,\n먼저 연습해요",
    sub: "역할극이 끝나면 잘한 점과 개선점을 바로 알려드려요",
  },
  {
    key: "fit",
    fits: true,
    title: "응답·목소리·표정·자세\n4-Fit 실시간 분석",
    sub: "사용 가능한 카메라·마이크 신호와 답변을 함께 살펴봐요",
  },
  {
    key: "privacy",
    icon: <LockKeyhole size={46} />,
    title: "시작하기 전에\n정보 처리를 확인해요",
    sub: "음성·대화 내용은 서버로 전송될 수 있어요. 민감한 정보는 말하지 마세요.",
  },
];

export function AttractLoop({ active, onStart }) {
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef(null);
  const timerRef = useRef(0);
  const visibleRef = useRef(false);
  visibleRef.current = visible;

  // 유휴 감지: active(홈 화면)일 때만 무장하고, 어떤 조작이든 타이머를 리셋한다.
  useEffect(() => {
    if (!active) { setVisible(false); return undefined; }
    const delay = idleDelayMs();
    const arm = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setVisible(true), delay);
    };
    const onActivity = () => {
      if (visibleRef.current) return;
      arm();
    };
    arm();
    const events = ["pointerdown", "pointermove", "keydown", "touchstart"];
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    return () => {
      window.clearTimeout(timerRef.current);
      events.forEach((name) => window.removeEventListener(name, onActivity));
    };
  }, [active]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (visible) { setSlide(0); dialog.showModal(); }
    else dialog.close();
  }, [visible]);

  useEffect(() => {
    if (!visible || paused || reducedMotion) return undefined;
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [visible, paused, reducedMotion]);

  const current = SLIDES[slide];

  // 닫힌 native dialog는 포커스와 포인터를 차단하지 않는다.
  return (
    <dialog
      ref={dialogRef}
      className={`attract-overlay${visible ? " is-on" : ""}`}
      aria-label="연습 서비스 안내"
      data-paused={paused || reducedMotion}
      onCancel={() => setVisible(false)}
    >
      <div className="attract-glow" aria-hidden="true" />
      <div className="attract-brand"><span className="brand-mark brand-mark--mirror" aria-hidden="true"><img src="/icons/mirror-ting-mark-slim.png" alt="" /></span><strong>Mirror-Ting</strong></div>
      {visible && (
        <AnimatePresence mode="wait">
          <motion.div key={current.key} className="attract-slide" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
            {current.fits ? (
              <div className="attract-fits" aria-hidden="true">
                {["response", "voice", "expression", "posture"].map((fit) => (
                  <span key={fit} className={`attract-fit ${fit}`}><IconGlyph icon={fit} size={27} /></span>
                ))}
              </div>
            ) : (
              <span className="attract-icon" aria-hidden="true">{current.icon}</span>
            )}
            <h2>{current.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h2>
            <p>{current.sub}</p>
          </motion.div>
        </AnimatePresence>
      )}
      <div className="attract-dots" aria-hidden="true">
        {SLIDES.map((item, index) => <i key={item.key} className={index === slide ? "on" : ""} />)}
      </div>
      <button type="button" className="attract-cta" onClick={onStart}>연습 시작하기</button>
      <div className="attract-actions">
        {!reducedMotion && <button type="button" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>{paused ? "자동 전환 재개" : "자동 전환 멈추기"}</button>}
        <button type="button" onClick={() => setVisible(false)}>메인으로 돌아가기</button>
      </div>
    </dialog>
  );
}
