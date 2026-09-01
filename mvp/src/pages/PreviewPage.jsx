import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { Badge, Button, Card, CardContent } from "../components/ui/shadcn";
import { getEpisodeImage, getScenarioDescription } from "../data/setupCatalog";
import { resolveServiceMode } from "../lib/serviceModeContext";

export function PreviewPage({ serviceMode, onNext, starting, scenario, selectedEpisode, counterpartProfile, difficulty, aiHealth, consented, onConsent, error, permissionState, mode = 5 }) {
  const resolvedServiceMode = resolveServiceMode(serviceMode?.id);
  const episode = selectedEpisode || scenario?.episodes?.[0];
  const lead = scenario?.characters?.find((character) => character.id === episode?.character_id) || scenario?.characters?.[0];
  const permissionsGranted = permissionState.camera === "granted" && permissionState.microphone === "granted";
  const aiReady = Boolean(aiHealth?.dialogue_ready);
  const dialogueName = aiHealth?.dialogue_provider === "openai" ? "GPT-4o 대화 AI" : "Ollama 대화 AI";
  const canStart = consented && !starting;
  const objectives = episode?.points?.length ? episode.points : ["대화의 핵심을 먼저 말해요", "상대가 다음에 할 일을 분명히 요청해요", "마무리 전에 합의 내용을 확인해요"];
  const facts = [
    { label: "직무", value: counterpartProfile?.title || "선택한 직무", subtext: counterpartProfile?.text || "선택한 업무 상황을 바탕으로 연습해요", image: counterpartProfile?.image },
    { label: "연습 상황", value: episode?.title || scenario?.title || "상황을 불러오고 있어요", subtext: getScenarioDescription(episode?.situation || scenario?.description || "선택한 업무 상황을 바탕으로 연습해요"), image: getEpisodeImage(scenario?.slug, episode?.id), icon: "briefcase" },
    { label: "난이도", value: difficulty?.title || "기본 모드", subtext: difficulty?.text || "편안한 질문 흐름으로 시작해요.", image: difficulty?.image, icon: "normal" },
  ];
  const readiness = [
    { icon: "chat", label: dialogueName, value: aiReady ? "준비됨" : "실행 필요" },
    { icon: "voice", label: "음성 인식", value: permissionState.microphone === "granted" ? "권한 허용됨" : "시작할 때 확인" },
    { icon: "eye", label: "카메라", value: permissionState.camera === "granted" ? "권한 허용됨" : "시작할 때 확인" },
  ];

  return <motion.section className="page preview-page preview-redesign preflight-preview" aria-labelledby="preview-title" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
    <header className="preview-heading">
      <div><p>{resolvedServiceMode.previewEyebrow}</p><h1 id="preview-title">상황을 미리 확인해요</h1><span>선택한 {resolvedServiceMode.label} 연습 설정을 확인하고, 바로 시작해요.</span></div>
      <dl className="preview-duration"><dt>예상 소요 시간</dt><dd>약 {mode}분</dd></dl>
    </header>
    <Card className="preview-scenario-panel preview-overview-card">
      <CardContent>
        <div className="preview-panel-heading"><span>시뮬레이션 구성</span><p>연습에서 맡을 역할과 대화의 목적을 확인해요.</p></div>
        <ol className="preview-facts">{facts.map((fact, index) => <li key={fact.label}><b>{String(index + 1).padStart(2, "0")}</b><span className="preview-image">{fact.image ? <img src={fact.image} alt="" /> : <IconGlyph icon={fact.icon} size={24} />}</span><div><small>{fact.label}</small><strong>{fact.value}</strong><em>{fact.subtext}</em></div></li>)}</ol>
        <section className="preview-objectives"><div className="preview-section-label"><IconGlyph icon="target" size={22} /> 대화 핵심</div><p>아래 흐름을 기억하고 대화를 시작해요.</p><ol>{objectives.slice(0, 3).map((objective, index) => <li key={objective}><b>{String(index + 1).padStart(2, "0")}</b><span>{objective}</span>{index === 0 && <em>첫 장면에서 확인</em>}</li>)}</ol></section>
      </CardContent>
    </Card>
    <div className="preview-support-grid" aria-label="연습 준비 정보">
      <Card className="preview-counterpart-card"><CardContent><div className="preview-panel-heading"><span>AI 상대 정보</span><p>선택한 역할에 맞춰 대화가 이어져요.</p></div><div className="preview-counterpart"><span className="preview-counterpart-image">{counterpartProfile?.image ? <img src={counterpartProfile.image} alt="" /> : <IconGlyph icon="person" size={32} />}</span><div><h2>{lead?.name || counterpartProfile?.title || "AI 상대"}</h2><strong>{counterpartProfile?.title || lead?.role || "역할극 상대"}</strong><p>{lead?.personality || counterpartProfile?.text || "이번 역할극에서 함께 대화할 사람이에요."}</p></div></div><dl className="preview-role-details"><div><dt>대화 방식</dt><dd>{counterpartProfile?.text || "핵심부터 듣고, 근거를 확인해요"}</dd></div><div><dt>난이도</dt><dd>{difficulty?.title || "기본 모드"} · {difficulty?.text || "질문에 차분히 답해요"}</dd></div></dl></CardContent></Card>
      <Card className="preview-readiness-card"><CardContent><div className="preview-panel-heading"><span>시스템 준비 상태</span><p>{permissionsGranted ? "카메라와 마이크가 준비됐어요." : "시작할 때 권한을 확인해요."}</p></div><ul>{readiness.map((item) => <li key={item.label}><IconGlyph icon={item.icon} size={20} /><span>{item.label}</span><Badge variant="neutral">{item.value}</Badge></li>)}</ul></CardContent></Card>
    </div>
    <div className="preview-start-area"><label className="consent-check"><input type="checkbox" checked={consented} onChange={(event) => onConsent(event.target.checked)} /><span>카메라·음성 분석에 동의해요. AI 상대 음성은 외부 음성 서비스로 만들 수 있고, 이 연습은 계정에 저장하지 않아요.</span></label>{error && <p className="preview-error" role="alert">{error}</p>}<Button className="preview-start-button" size="lg" type="button" onClick={onNext} disabled={!canStart}>{starting ? "연습을 준비하고 있어요" : "동의하고 시작하기"}<ArrowRight size={20} /></Button></div>
  </motion.section>;
}
