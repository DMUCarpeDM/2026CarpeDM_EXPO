import "../../styles/interview-focus.css";

const labels = ["직무 선택", "시나리오 선택", "난이도 선택", "사전 점검"];

export function InterviewProgress({ active }) {
  return <div className="interview-progress" aria-label={`면접 준비 ${active + 1} / 4 · ${labels[active]}`}>
    <div aria-hidden="true">{labels.map((label, index) => <span key={label} className={index <= active ? "complete" : ""} />)}</div>
    <p>{active + 1} / 4 · {labels[active]}</p>
  </div>;
}
