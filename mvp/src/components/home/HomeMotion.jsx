import { useEffect, useRef, useState } from "react";
import { animate, inView, useReducedMotion } from "framer-motion";

// Animate existing children without adding wrappers to the mode-specific grids.
export function HomeMotion({ children }) {
  const root = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const container = root.current;
    if (!container || reduced) return;
    const cleanups = [];
    const running = new Map();
    const revealed = new Set();
    const targets = [];
    const reveal = (element, immediate = false) => {
      if (immediate) {
        running.get(element)?.stop();
        element.style.opacity = "1";
        element.style.transform = "none";
      } else if (!revealed.has(element)) {
        running.set(element, animate(element, { opacity: 1, y: 0 }, {
          duration: 0.5, delay: 0.5 + Number(element.dataset.homeDelay || 0), ease: [0.22, 1, 0.36, 1],
        }));
      }
      revealed.add(element);
    };
    Array.from(container.children).slice(1).forEach((section) => {
      Array.from(section.children).forEach((child) => {
        const isGrid = getComputedStyle(child).display === "grid";
        const group = isGrid ? Array.from(child.children) : [child];
        group.forEach((element, index) => {
          // Keep content already visible at mount readable, including anchor landings.
          if (element.getBoundingClientRect().top < window.innerHeight) return;
          targets.push(element);
          element.dataset.homeDelay = String(Math.min(index * 0.08, 0.24));
          element.classList.add("home-reveal-target");
          element.style.opacity = "0";
          element.style.transform = "translateY(20px)";
          cleanups.push(inView(element, () => reveal(element), { margin: "0px 0px -24px 0px" }));
        });
      });
    });
    const onFocus = (event) => targets.forEach((element) => {
      if (element.contains(event.target)) reveal(element, true);
    });
    container.addEventListener("focusin", onFocus);
    return () => {
      cleanups.forEach((stop) => stop());
      running.forEach((animation) => animation.stop());
      container.removeEventListener("focusin", onFocus);
      targets.forEach((element) => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("transform");
        element.classList.remove("home-reveal-target");
        delete element.dataset.homeDelay;
      });
    };
  }, [reduced]);

  return <div ref={root} className="home-scroll-content" id="home-top">{children}</div>;
}

const destinations = {
  interview: ["interview-flow", ".interview-report-showcase", ".interview-feedback"],
  training: ["training-scenarios", ".training-practice-section", ".training-faq"],
  workplace: ["workplace-scenarios", ".workplace-workspace-section", ".workplace-feedback"],
};

export function HomeFooter({ mode, onNext, onModeSelect }) {
  const footer = useRef(null);
  const reduced = useReducedMotion();
  const [fits, setFits] = useState(false);
  const [overview, preview, coaching] = destinations[mode] || destinations.workplace;
  const jump = (selector) => {
    const page = footer.current.closest(".mode-home-page");
    const target = selector.startsWith(".") ? page.querySelector(selector) : document.getElementById(selector);
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  useEffect(() => {
    const element = footer.current;
    const measure = () => setFits(window.innerWidth >= 900 && element.offsetHeight < window.innerHeight - 100);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  return (
    <footer ref={footer} className={`home-site-footer${fits && !reduced ? " home-site-footer--reveal" : ""}`} aria-label="서비스 안내" onFocusCapture={() => {
      // A sticky footer may still be covered by the content when tabbed into.
      if (fits && !reduced) footer.current.closest(".mode-home-page").scrollIntoView({ behavior: "auto", block: "end" });
    }}>
      <div className="home-site-footer__inner">
        <div className="home-site-footer__brand">
          <strong>Mirror-Ting</strong>
          <p>중요한 대화 전에 먼저 연습해요.<br />AI와 말해보고, 다음에 바꿀 점을 찾아보세요.</p>
        </div>
        <nav className="home-site-footer__links" aria-label="하단 메뉴">
          <div><h2>연습하기</h2><button onClick={onNext}>연습할 직무 고르기</button><button onClick={onModeSelect}>다른 모드 둘러보기</button></div>
          <div><h2>서비스 살펴보기</h2><button onClick={() => jump(overview)}>연습 과정 살펴보기</button><button onClick={() => jump(preview)}>코칭 화면 미리보기</button></div>
          <div><h2>이용 안내</h2><button onClick={() => jump(coaching)}>{mode === "training" ? "자주 묻는 질문" : "피드백 알아보기"}</button><button onClick={() => jump("home-top")}>처음으로 돌아가기</button></div>
        </nav>
        <div className="home-site-footer__bottom"><small>© {new Date().getFullYear()} Mirror-Ting</small><button onClick={onModeSelect}>서비스 모드 선택 <span aria-hidden="true">↗</span></button></div>
      </div>
    </footer>
  );
}
