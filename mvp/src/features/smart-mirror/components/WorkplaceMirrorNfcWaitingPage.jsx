import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-city.css";
import "../styles/workplace-mirror-nfc.css";

export function WorkplaceMirrorNfcWaitingPage({ onStart }) {
  return <section className="mirror-nfc-waiting mirror-city-surface" aria-labelledby="nfc-waiting-title">
    <header className="overview-masthead"><strong>Mirror-Ting</strong></header>
    <div className="mirror-nfc-content">
      <button className="mirror-nfc-symbol" type="button" onClick={onStart} aria-label="분석에 동의하고 실제 체험 시작" aria-describedby="mirror-nfc-disclosure" title="클릭하여 실제 체험 시작">
        <svg viewBox="0 0 240 240" fill="none" aria-hidden="true">
          <rect x="60" y="46" width="110" height="150" rx="18" transform="rotate(-12 115 121)" />
          <path d="M98 90h29M93 108h44M91 163h30" />
          <path d="M157 92q29 28 0 56M174 77q44 43 0 86M191 62q60 58 0 116" />
        </svg>
      </button>
      <WorkplaceOverviewCard labelledBy="nfc-waiting-title" live="polite">
        <div className="overview-card-context">
          <p className="overview-scene-meta"><span className="overview-scene-badge">NFC 대기</span></p>
          <h1 id="nfc-waiting-title">사원증을 태그해 주세요.</h1>
        </div>
        <p className="mirror-nfc-instruction">사원증을 리더기에 대거나<br />위 아이콘을 눌러 체험을 시작해요.</p>
        <p className="mirror-nfc-next" id="mirror-nfc-disclosure">아이콘을 누르면 카메라·음성 분석과 결과 처리에 동의하고 시작해요. 연습 음성과 결과는 이 브라우저에 보관되며 서버에서도 세션·기록을 처리해요.</p>
      </WorkplaceOverviewCard>
    </div>
  </section>;
}
