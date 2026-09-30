import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Button } from "../ui/shadcn";
import { IconGlyph } from "../ui/IconGlyph";
import { InterviewProgress } from "./InterviewProgress";

export function InterviewPreflight({ facts, mode, lead, objectives, aiReady, permissionState, consented, onConsent, starting, onNext, onPrev, error }) {
  const deviceStatus = (value) => value === "granted" ? "권한 허용됨" : value === "denied" ? "권한 차단됨" : "시작 시 확인";
  const devices = [
    { icon: "chat", label: "면접 AI", status: aiReady ? "준비됨" : "연결 확인 필요", help: aiReady ? "질문에 답하면 대화가 이어져요." : "연결되지 않으면 시작 시 오류 안내를 확인해 주세요." },
    { icon: "voice", label: "마이크", status: deviceStatus(permissionState.microphone), help: permissionState.microphone === "denied" ? "브라우저 사이트 설정에서 마이크를 허용해 주세요." : "주변 소음을 줄이고 또렷하게 말해 주세요." },
    { icon: "eye", label: "카메라", status: deviceStatus(permissionState.camera), help: permissionState.camera === "denied" ? "브라우저 사이트 설정에서 카메라를 허용해 주세요." : "얼굴과 상체가 화면에 들어오도록 준비해 주세요." },
  ];
  return <section className="page preview-page preflight-preview interview-preflight interview-ready" aria-labelledby="preview-title">
    <InterviewProgress active={3} />
    <header className="preview-heading"><div><h1 id="preview-title">이제, 말해볼 준비 됐나요?</h1><span>설정과 준비 상태를 확인하면 면접을 시작할 수 있어요.</span></div></header>
    <section className="interview-ready-summary" aria-labelledby="ready-summary-title">
      <div className="interview-ready-heading"><h2 id="ready-summary-title">이번 면접</h2><span>약 {mode}분</span></div>
      <dl>{facts.map((fact) => <div key={fact.label}>{fact.image && <img src={fact.image} alt="" width="48" height="48" />}<div><dt>{fact.label}</dt><dd>{fact.value}</dd></div></div>)}</dl>
      <details><summary>면접 진행 안내</summary><p>{lead?.name || "AI 면접관"}의 질문을 듣고 평소 말하는 방식으로 답해 보세요.</p><ul>{objectives.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul></details>
    </section>
    <section className="interview-ready-devices" aria-labelledby="ready-device-title">
      <h2 id="ready-device-title">시작 전 확인</h2>
      <p>아직 녹화·녹음하지 않아요. 시작 버튼을 누르면 장치 권한을 확인해요.</p>
      <ul>{devices.map((item) => <li key={item.label}><IconGlyph icon={item.icon} size={24} /><div><div className="interview-device-title"><h3>{item.label}</h3><span>{item.status}</span></div><p>{item.help}</p></div></li>)}</ul>
    </section>
    <div className="interview-ready-consent">
      <label><input type="checkbox" checked={consented} disabled={starting} onChange={(event) => onConsent(event.target.checked)} /><span>카메라·음성 분석 및 기록 처리에 동의해요.</span></label>
      <p>AI 상대 음성은 외부 음성 서비스로 만들 수 있어요. 연습 음성과 분석 결과는 이 브라우저에 보관되며, 서버의 세션·기록 처리도 이루어져요.</p>
    </div>
    {error && <p className="preview-error" role="alert">{error}</p>}
    <div className="interview-ready-actions"><Button variant="outline" onClick={onPrev} disabled={starting}>이전</Button><Button className="preview-start-button" onClick={onNext} disabled={!consented || starting}>{starting ? "연습을 준비하고 있어요" : "면접 시작하기"}<ArrowRight size={20} /></Button></div>
  </section>;
}
