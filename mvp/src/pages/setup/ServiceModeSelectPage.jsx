import { useLayoutEffect } from "react";
import interviewServiceImage from "../../assets/service-modes/interview-practice-v2.png";
import trainingServiceImage from "../../assets/service-modes/training-workflow-v3.png";
import workplaceServiceImage from "../../assets/service-modes/workplace-chat-v2.png";
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
    interview: [interviewServiceImage, "노트북 앞에서 면접 답변을 연습하는 모습"],
    training: [trainingServiceImage, "학습, 실습, 피드백 순서로 진행하는 직업훈련 화면"],
    workplace: [workplaceServiceImage, "팀원과 업무 의견을 조율하는 직장대화 화면"],
  }[id];

  return <img className={`choice-asset service-mode-visual service-mode-visual--${id}`} src={preview[0]} alt={preview[1]} />;
}
