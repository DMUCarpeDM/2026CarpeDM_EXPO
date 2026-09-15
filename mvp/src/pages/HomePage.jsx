import { HomeMotion, HomeFooter } from "../components/home/HomeMotion";
import { InterviewHome } from "../components/home/InterviewHome";
import { TrainingHome } from "../components/home/TrainingHome";
import { WorkplaceHome } from "../components/home/WorkplaceHome";
import { resolveServiceHomeContent } from "../data/serviceHomeContent";
import "../styles/home-motion.css";

export function HomePage({ serviceMode, onNext, onModeSelect }) {
  const mode = resolveServiceHomeContent(serviceMode?.id);

  return (
    <section className={`page home-page mode-home-page mode-home-page--${mode.id}`}>
      <HomeMotion key={mode.id}>
        {mode.id === "interview" && <InterviewHome onNext={onNext} />}
        {mode.id === "training" && <TrainingHome onNext={onNext} />}
        {mode.id === "workplace" && <WorkplaceHome onNext={onNext} />}
      </HomeMotion>
      <HomeFooter mode={mode.id} onNext={onNext} onModeSelect={onModeSelect} />
    </section>
  );
}
