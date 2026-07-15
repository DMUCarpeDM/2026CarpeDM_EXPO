import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Check } from "reicon-react/icons/Check";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { Panel } from "../components/report/ResultPrimitives";

export function PreviewPage({ onNext, starting, scenario, setupScenario, counterpartProfile, goal, difficulty, aiHealth, consented, onConsent, error, permissionState, mode = 5 }) {
  const episode = scenario?.episodes?.[0];
  const lead = scenario?.characters?.[0];
  const permissionsGranted = permissionState.camera === "granted" && permissionState.microphone === "granted";
  const aiReady = aiHealth?.dialogue_provider === "ollama" && aiHealth?.ollama?.dialogue;
  const objectives = episode?.points?.length ? episode.points : ["대화의 핵심을 먼저 말해요", "상대가 다음에 할 일을 분명히 요청해요", "마무리 전에 합의 내용을 확인해요"];
  const facts = [
    { label: "상대 역할", value: counterpartProfile?.title || lead?.role || "AI 역할", subtext: counterpartProfile?.text || lead?.name || "AI가 대화를 이어가요", image: counterpartProfile?.image },
    { label: "연습 상황", value: setupScenario?.title || scenario?.title || "상황을 불러오고 있어요", subtext: setupScenario?.text || scenario?.description || "선택한 업무 상황을 바탕으로 연습해요", image: setupScenario?.image },
    { label: "연습 목표", value: goal?.title || "대화 목표", subtext: goal?.text || objectives[0], image: goal?.image },
  ];
  const context = [
    ["언제", episode?.situation?.split(".")[0] || "연습 시작 전"],
    ["어디서", scenario?.world_setting?.location || setupScenario?.detail || "업무 공간"],
    ["배경", setupScenario?.text || episode?.situation || scenario?.description || "상황을 불러오고 있어요"],
  ];
  const readiness = [
    { icon: "chat", label: "대화 AI", value: aiReady ? "준비됨" : "기본 질문으로 진행" },
    { icon: "voice", label: "음성 인식", value: permissionState.microphone === "granted" ? "권한 허용됨" : "시작할 때 확인" },
    { icon: "eye", label: "카메라", value: permissionState.camera === "granted" ? "권한 허용됨" : "시작할 때 확인" },
  ];

  return <motion.section className="page preview-page preview-redesign" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
    <header className="preview-heading">
      <div><p>시뮬레이션 준비</p><h1>상황을 미리 확인해요</h1><span>선택한 설정을 확인하고, 바로 연습을 시작해요.</span></div>
      <dl className="preview-duration"><dt>예상 소요 시간</dt><dd>약 {mode}분</dd></dl>
    </header>
    <div className="preview-layout">
      <Panel className="preview-scenario-panel">
        <div className="preview-panel-heading"><span>시뮬레이션 구성</span><p>연습에서 맡을 역할과 대화의 목적을 확인해요.</p></div>
        <ol className="preview-facts">{facts.map((fact, index) => <li key={fact.label}><b>{String(index + 1).padStart(2, "0")}</b><span className="preview-image"><img src={fact.image} alt="" /></span><div><small>{fact.label}</small><strong>{fact.value}</strong><em>{fact.subtext}</em></div></li>)}</ol>
        <section className="preview-context-block"><div className="preview-section-label"><IconGlyph icon="briefcase" size={22} /> 상황 설정</div><dl>{context.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="preview-objectives"><div className="preview-section-label"><IconGlyph icon="target" size={22} /> 이번 연습 목표</div><p>아래 흐름 중 하나만 기억하고 대화를 시작해요.</p><ol>{objectives.slice(0, 3).map((objective, index) => <li key={objective}><b>{String(index + 1).padStart(2, "0")}</b><span>{objective}</span>{index === 0 && <em>선택됨</em>}</li>)}</ol></section>
      </Panel>
      <aside className="preview-side" aria-label="연습 준비 정보">
        <Panel className="preview-counterpart-card"><div className="preview-panel-heading"><span>AI 상대 정보</span><p>선택한 역할에 맞춰 대화가 이어져요.</p></div><div className="preview-counterpart"><span className="preview-counterpart-image"><img src={counterpartProfile?.image} alt="" /></span><div><h2>{lead?.name || counterpartProfile?.title || "AI 상대"}</h2><strong>{counterpartProfile?.title || lead?.role || "역할극 상대"}</strong><p>{lead?.personality || counterpartProfile?.text || "이번 역할극에서 함께 대화할 사람이에요."}</p></div></div><dl className="preview-role-details"><div><dt>대화 방식</dt><dd>{counterpartProfile?.text || "핵심부터 듣고, 근거를 확인해요"}</dd></div><div><dt>난이도</dt><dd>{difficulty?.title || "기본 모드"} · {difficulty?.text || "질문에 차분히 답해요"}</dd></div></dl></Panel>
        <Panel className="preview-readiness-card"><div className="preview-panel-heading"><span>시스템 준비 상태</span><p>{permissionsGranted ? "카메라와 마이크가 준비됐어요." : "시작할 때 권한을 확인해요."}</p></div><ul>{readiness.map((item) => <li key={item.label}><IconGlyph icon={item.icon} size={20} /><span>{item.label}</span><strong>{item.value}</strong></li>)}</ul></Panel>
      </aside>
    </div>
    <div className="preview-start-area"><label className="consent-check"><input type="checkbox" checked={consented} onChange={(event) => onConsent(event.target.checked)} /><span>카메라·음성 분석을 위해 개인정보 처리에 동의해요. 이 연습은 계정에 저장하지 않아요.</span></label>{error && <p className="preview-error">{error}</p>}<button className="primary-bar" type="button" onClick={onNext}>{starting ? "연습을 준비하고 있어요" : "동의하고 시작하기"}<ArrowRight size={24} /></button></div>
  </motion.section>;
}
