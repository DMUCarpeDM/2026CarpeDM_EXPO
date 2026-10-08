import { AnimatePresence, motion } from "framer-motion";
import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import arrival from "../assets/arrival.png";
import work from "../assets/work.png";
import leaving from "../assets/leaving.png";
import "../styles/workplace-mirror-overview.css";

const illustrations = [arrival, work, leaving];
const descriptions = ["사무실 입구에서 선임과 대화하는 두 사람", "책상 앞에서 업무를 확인하는 두 사람", "사무실 출구에서 퇴근 전 대화하는 두 사람"];

function DayProgress({ scenes, phase }) {
  return <ol className="overview-steps" aria-label="오늘 만날 세 장면">
    {scenes.map((scene, index) => <li key={scene.name} aria-current={index === phase.scene ? "step" : undefined} data-complete={index < phase.scene}>
      <div className="overview-step-label"><span>0{index + 1}</span><strong>{scene.name}</strong></div>
      <div className="overview-step-track"><i style={{ transform: `scaleX(${index < phase.scene ? 1 : index === phase.scene ? phase.progress : 0})` }} /></div>
    </li>)}
  </ol>;
}

// Session preparation, consent and automatic navigation stay in the preflight controller.
export function WorkplaceMirrorOverview({ scenes, phase, starting, reduced }) {
  const scene = scenes[phase.scene];
  const countdown = phase.kind === "countdown";
  const finishing = starting || phase.kind === "complete";
  return <section className="mirror-overview" aria-labelledby="overview-title" data-scene={phase.scene} data-starting={countdown || finishing} data-glass={new URLSearchParams(window.location.search).get("glass") === "bright" ? "bright" : "standard"}>
    <header className="overview-masthead"><strong>Mirror-Ting</strong></header>
    <DayProgress scenes={scenes} phase={phase} />
    <div className="overview-content">
      <div className="overview-context">
        <p className="overview-eyebrow">오늘의 대화 연습</p>
        <h1 id="overview-title">회사에서 보내는 하루.</h1>
        <p className="overview-situation">출근부터 퇴근까지, 세 장면을 미리 살펴봐요.</p>
      </div>
      <div className="overview-art" aria-hidden="true">
        <AnimatePresence initial={false}>
          <motion.img key={phase.scene} src={illustrations[phase.scene]} alt={descriptions[phase.scene]}
            initial={{ opacity: 0, transform: reduced ? "none" : "translateX(24px)" }}
            animate={{ opacity: 1, transform: "translateX(0px)" }}
            exit={{ opacity: 0, transform: reduced ? "none" : "translateX(-24px)" }}
            transition={{ duration: reduced ? .15 : .4, ease: [.23, 1, .32, 1] }} />
        </AnimatePresence>
      </div>
      <WorkplaceOverviewCard scene={scene} />
    </div>
    {(countdown || finishing) && <footer className="overview-footer">
      <p role="status">{finishing ? "출근 대화를 준비하고 있어요." : `${phase.remaining}초 후 출근 대화가 시작돼요.`}</p>
    </footer>}
  </section>;
}
