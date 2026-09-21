import { useState } from "react";
import workplaceImage from "../../assets/service-modes/workplace-conversation.png";
import interviewImage from "../../assets/service-modes/interview-practice.png";
import trainingImage from "../../assets/service-modes/job-training.png";
import "../../styles/service-mode-select.css";

const modes = [
  { id: "interview", title: "면접 연습", description: "실전 질문에 답해 보세요", image: interviewImage },
  { id: "training", title: "직무 훈련", description: "업무 상황을 단계별로 연습해요", image: trainingImage },
  { id: "workplace", title: "직장 대화", description: "동료와의 대화를 연습해요", image: workplaceImage },
];

export function ServiceModeSelectPage({ onSelect }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = modes.find((mode) => mode.id === selectedId);

  return (
    <section className="service-mode-page mode-picker" aria-labelledby="mode-picker-title">
      <div className="mode-picker__content">
        <header className="mode-picker__header">
          <p className="mode-picker__brand">MIRROR-TING</p>
          <h1 id="mode-picker-title">어떤 순간을 연습해 볼까요?</h1>
          <p className="mode-picker__intro">나에게 필요한 연습을 선택하고, 조금 더 자신 있게 시작해요.</p>
        </header>
        <div className="mode-picker__grid" role="group" aria-label="연습 선택">
          {modes.map((mode) => (
            <button
              key={mode.id}
              className="mode-picker__card"
              type="button"
              aria-label={mode.title}
              aria-describedby={`mode-description-${mode.id}`}
              aria-pressed={selectedId === mode.id}
              onClick={() => setSelectedId(mode.id)}
            >
              <span className="mode-picker__image-wrap">
                <img className="mode-picker__image" src={mode.image} alt="" width="1254" height="1254" decoding="async" />
              </span>
              <span className="mode-picker__check" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span className="mode-picker__copy">
                <strong className="mode-picker__title">{mode.title}</strong>
                <span className="mode-picker__description" id={`mode-description-${mode.id}`}>{mode.description}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mode-picker__actions">
          <p className="mode-picker__hint" aria-live="polite">{selected ? `${selected.title}, 함께 연습해 볼까요?` : "연습하고 싶은 카드를 선택해 주세요"}</p>
          <button className="mode-picker__start" type="button" disabled={!selected} onClick={() => selected && onSelect(selected.id)}>
            시작하기 <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
