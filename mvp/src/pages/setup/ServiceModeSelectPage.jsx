import { useLayoutEffect } from "react";
import interviewServiceImage from "../../assets/service-modes/interview.png";
import trainingServiceImage from "../../assets/service-modes/training.png";
import workplaceServiceImage from "../../assets/service-modes/workplace.png";
import { ChoiceCard, SetupMotionPage } from "../../components/setup/SetupComponents";
import { serviceModes } from "../../data/setupCatalog";
import "../../styles/service-mode-select.css";

const serviceModeImages = {
  interview: interviewServiceImage,
  training: trainingServiceImage,
  workplace: workplaceServiceImage,
};

export function ServiceModeSelectPage({ onSelect }) {
  useLayoutEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  }, []);

  return (
    <SetupMotionPage as="div">
      <div className="service-mode-page">
        <div className="selection-main setup-flow-main service-mode-main">
          <div className="choice-grid three service-mode-choice-grid">
            {serviceModes.map((item) => (
              <ChoiceCard
                key={item.id}
                image={serviceModeImages[item.id]}
                title={item.label}
                variant="service-mode-card"
                minimalContent
                onClick={() => onSelect(item.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </SetupMotionPage>
  );
}
