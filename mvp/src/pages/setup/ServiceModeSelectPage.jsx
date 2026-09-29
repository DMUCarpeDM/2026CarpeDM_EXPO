import { useLayoutEffect } from "react";
import interviewServiceImage from "../../assets/duotone/service-interview.png";
import trainingServiceImage from "../../assets/duotone/service-training.png";
import workplaceServiceImage from "../../assets/duotone/service-workplace.png";
import { Card } from "../../components/ui/shadcn";
import { serviceModes } from "../../data/setupCatalog";
import "../../styles/service-mode-select.css";

export function ServiceModeSelectPage({ onSelect }) {
  useLayoutEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  }, []);

  return (
    <div className="setup-flow-page service-mode-page">
      <main className="service-mode-main" aria-label="서비스 모드 선택">
        <div className="service-mode-grid">
          {serviceModes.map((item) => (
            <Card className={`service-mode-card-v2 service-mode-card-v2--${item.id}`} key={item.id}>
              <button
                aria-label={item.label}
                aria-pressed="false"
                className="choice-card service-mode-card service-mode-card-button"
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <ModePreview id={item.id} />
                <strong className="service-mode-card-title">{item.label}</strong>
              </button>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

function ModePreview({ id }) {
  const preview = {
    interview: [interviewServiceImage, "면접 연습 아이콘"],
    training: [trainingServiceImage, "직업훈련 아이콘"],
    workplace: [workplaceServiceImage, "직장대화 아이콘"],
  }[id];

  return <img className={`choice-asset service-mode-visual service-mode-visual--${id}`} src={preview[0]} alt={preview[1]} />;
}
