import { useLayoutEffect } from "react";
import interviewServiceImage from "../../assets/service-modes/interview-soft-blue-v4.png";
import trainingServiceImage from "../../assets/service-modes/training-soft-blue-v4.png";
import workplaceServiceImage from "../../assets/service-modes/workplace-soft-blue-v4.png";
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
        <header className="service-mode-heading">
          <h1>중요한 대화 전에, 먼저 연습해요.</h1>
          <p>면접부터 현장 업무, 직장대화까지. 지금 필요한 연습을 골라보세요.</p>
        </header>
        <div className="service-mode-grid">
          {serviceModes.map((item) => (
            <Card className={`service-mode-card-v2 service-mode-card-v2--${item.id}`} key={item.id}>
              <button
                aria-label={item.label}
                className="choice-card service-mode-card service-mode-card-button"
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <div className="service-mode-visual-frame"><ModePreview id={item.id} /></div>
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
    interview: [interviewServiceImage, "정식 면접실에서 지원자가 두 면접관에게 답변하는 모습"],
    training: [trainingServiceImage, "강사가 노트북 실습 중인 교육생을 지도하는 모습"],
    workplace: [workplaceServiceImage, "회의실에서 동료들이 업무 자료를 보며 의견을 조율하는 모습"],
  }[id];

  return <img className={`choice-asset service-mode-visual service-mode-visual--${id}`} src={preview[0]} alt={preview[1]} />;
}
