import { useEffect, useRef } from "react";
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
          duration: 0.24, delay: Number(element.dataset.homeDelay || 0), ease: [0.22, 1, 0.36, 1],
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
          element.dataset.homeDelay = String(Math.min(index * 0.04, 0.12));
          element.classList.add("home-reveal-target");
          element.style.opacity = "0";
          element.style.transform = "translateY(8px)";
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
  interview: ["interview-studio-tour", "interview-report", "interview-feedback"],
  training: ["training-scenarios", ".training-practice-section", ".training-faq"],
  workplace: ["workplace-scenarios", "workplace-studio-tour", ".workplace-feedback"],
};

export function HomeFooter({ mode, onNext, onModeSelect }) {
  const footer = useRef(null);
  const reduced = useReducedMotion();
  const [overview, preview, coaching] = destinations[mode] || destinations.workplace;
  const jump = (selector) => {
    const page = footer.current.closest(".mode-home-page");
    const target = selector.startsWith(".") ? page.querySelector(selector) : document.getElementById(selector);
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reduced || document.documentElement.dataset.input === "keyboard" ? "auto" : "smooth", block: "start" });
  };

  return (
    <footer ref={footer} className="home-site-footer" aria-label="서비스 안내">
      <div className="home-site-footer__inner">
        <div className="home-site-footer__links">
          <nav aria-label="서비스 살펴보기">
            <h2>둘러보기 <span>EXPLORE</span></h2>
            <button type="button" onClick={() => jump(overview)}>연습 과정 살펴보기</button>
            <button type="button" onClick={() => jump(preview)}>코칭 화면 미리보기</button>
            <button type="button" onClick={() => jump(coaching)}>{mode === "training" ? "자주 묻는 질문" : "피드백 알아보기"}</button>
          </nav>
          <nav aria-label="연습하기">
            <h2>연습하기 <span>PRACTICE</span></h2>
            <button type="button" onClick={onNext}>{mode === "workplace" ? "연습 시작하기" : "연습할 직무 고르기"} <span aria-hidden="true">↗</span></button>
            <button type="button" onClick={onModeSelect}>다른 모드 둘러보기 <span aria-hidden="true">↗</span></button>
          </nav>
          <section className="home-site-footer__project" aria-label="프로젝트 안내">
            <h2>함께 만드는 대화 <span>PROJECT</span></h2>
            <a href="https://github.com/DMUCarpeDM/2026CarpeDM_EXPO" target="_blank" rel="noopener noreferrer" aria-label="CarpeDM 프로젝트 (새 탭)">CarpeDM 프로젝트 <span aria-hidden="true">↗</span></a>
            <p>동양미래대학교<br />인공지능소프트웨어학과</p>
            <p className="home-site-footer__note">중요한 대화 전에 먼저 연습해요.<br />다음 대화에서 바꿀 한 가지를 찾아보세요.</p>
          </section>
        </div>
        <div className="home-site-footer__signature" role="img" aria-label="Mirror-Ting">
          <img src="/icons/mirror-ting-mark-slim.png" alt="" />
          <span aria-hidden="true">Mirror-Ting</span>
        </div>
        <div className="home-site-footer__bottom">
          <span>말하기의 다음 장면을 함께.</span>
          <button type="button" onClick={() => jump("home-top")}>맨 위로 <span aria-hidden="true">↑</span></button>
          <small>© {new Date().getFullYear()} CarpeDM · Mirror-Ting</small>
        </div>
      </div>
    </footer>
  );
}
