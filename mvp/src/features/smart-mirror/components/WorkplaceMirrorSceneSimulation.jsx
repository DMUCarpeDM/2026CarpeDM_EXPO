import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CounterpartVideo } from "../../../components/practice/CounterpartVideo";
import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import morning from "../assets/simulation/morning.png";
import work from "../assets/simulation/work.png";
import leaving from "../assets/simulation/leaving.png";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-simulation.css";

const backgrounds = { morning, work, leaving };

export function WorkplaceMirrorSceneSimulation({ category = "morning", characterId, name, videoState, paused, onReactionComplete, children }) {
  const reduced = useReducedMotion();
  return <section className="mirror-scene-simulation" aria-label="직장 대화 시뮬레이션">
    <div className="simulation-environment" aria-hidden="true"><AnimatePresence initial={false}>
      <motion.img key={category} src={backgrounds[category] || morning} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .15 : .7, ease: "easeInOut" }} />
    </AnimatePresence></div>
    <div className="simulation-actor"><CounterpartVideo characterId={characterId} name={name} state={videoState} paused={paused} onReactionComplete={onReactionComplete} /></div>
    <div className="simulation-card-slot"><WorkplaceOverviewCard labelledBy="mirror-dialogue-title">{children}</WorkplaceOverviewCard></div>
  </section>;
}
