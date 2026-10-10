import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-city.css";
import "../styles/workplace-mirror-nfc.css";

export function WorkplaceMirrorNfcWaitingPage({ onTest }) {
  const Icon = onTest ? "button" : import.meta.env.DEV ? "a" : "div";
  return <section className="mirror-nfc-waiting mirror-city-surface" aria-labelledby="nfc-waiting-title">
    <header className="overview-masthead"><strong>Mirror-Ting</strong></header>
    <div className="mirror-nfc-content">
      <Icon className="mirror-nfc-symbol" type={onTest ? "button" : undefined} onClick={onTest} href={!onTest && import.meta.env.DEV ? "/src/features/smart-mirror/previews/flow/index.html?backdrop=city" : undefined} aria-label={onTest ? "사원증 없이 실제 체험 시작" : import.meta.env.DEV ? "NFC 없이 요약 화면 테스트" : undefined} title={onTest ? "클릭하여 실제 체험 시작" : import.meta.env.DEV ? "클릭하여 요약 화면 테스트" : undefined}>
        <svg viewBox="0 0 240 240" fill="none" aria-hidden="true">
          <rect x="60" y="46" width="110" height="150" rx="18" transform="rotate(-12 115 121)" />
          <path d="M98 90h29M93 108h44M91 163h30" />
          <path d="M157 92q29 28 0 56M174 77q44 43 0 86M191 62q60 58 0 116" />
        </svg>
      </Icon>
      <WorkplaceOverviewCard labelledBy="nfc-waiting-title" live="polite">
        <div className="overview-card-context">
          <p className="overview-scene-meta"><span className="overview-scene-badge">{onTest ? "실제 입력 테스트" : "NFC 대기"}</span></p>
          <h1 id="nfc-waiting-title">{onTest ? "아이콘을 눌러 체험을 시작해요." : "사원증을 태그해 주세요."}</h1>
        </div>
        <p className="mirror-nfc-instruction">{onTest ? "사원증 없이 카메라·음성 입력과 분석 결과를 테스트해요." : <>키오스크에서 발급받은 사원증을<br />리더기에 가까이 대 주세요.</>}</p>
        <p className="mirror-nfc-next">{onTest ? "분석에 동의하고 카메라·마이크를 허용하면 시작해요." : "확인되면 오늘의 대화 안내가 시작돼요."}</p>
      </WorkplaceOverviewCard>
    </div>
  </section>;
}
