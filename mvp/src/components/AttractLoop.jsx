import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LockKeyhole } from "reicon-react/icons/LockKeyhole";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { IconGlyph } from "./ui/IconGlyph";

/** 전시 어트랙트 루프 — 홈 화면에서 일정 시간 조작이 없으면 가치 제안 슬라이드를
 *  순환하며 관람객의 발길을 잡는다. 아무 곳이나 터치하면 즉시 사라진다.
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
    title: "AI 팀장과 실전처럼\n대화를 연습해요",
    sub: "역할극이 끝나면 잘한 점과 개선점을 바로 알려드려요",
  },
  {
    key: "fit",
    fits: true,
    title: "응답·목소리·시선·자세\n4-Fit 실시간 분석",
    sub: "카메라와 마이크 신호를 이 기기 안에서 바로 분석해요",
  },
  {
    key: "privacy",
    icon: <LockKeyhole size={46} />,
    title: "당신의 영상은\n이 기기를 떠나지 않아요",
    sub: "100% 온디바이스 AI · API 비용 0원 · 인터넷 없이도 동작",
  },
];

export function AttractLoop({ active, onStart }) {
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);
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
      if (visibleRef.current) setVisible(false);
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
    if (!visible) return undefined;
    setSlide(0);
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [visible]);

  const current = SLIDES[slide];

  // 항상 마운트 + CSS 클래스 전환. AnimatePresence 언마운트에 기대던 이전 구조는
  // 중첩 exit가 완료되지 않으면 투명한 전체 화면 벽(pointer-events: auto)이
  // 영구 잔류해 아래 UI 터치를 전부 막았다 — 숨김/차단은 attract.css가 책임진다.
  return (
    <div
      className={`attract-overlay${visible ? " is-on" : ""}`}
      role="button"
      aria-label="화면을 터치하면 시작돼요"
      aria-hidden={!visible}
    >
      <div className="attract-glow" aria-hidden="true" />
      <div className="attract-brand"><span className="brand-mark" aria-hidden="true">M</span><strong>Mirror-Ting</strong></div>
      {visible && (
        <AnimatePresence mode="wait">
          <motion.div key={current.key} className="attract-slide" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
            {current.fits ? (
              <div className="attract-fits" aria-hidden="true">
                {["response", "voice", "eye", "posture"].map((fit) => (
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
      <button type="button" className="attract-cta" onClick={onStart} tabIndex={visible ? 0 : -1}>화면을 터치하면 시작돼요</button>
    </div>
  );
}
