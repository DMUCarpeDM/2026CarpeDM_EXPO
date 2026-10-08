import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Shader, Glass, Chrome, BrushedMetal, LinearGradient, getWebGPUSupport } from "shaders/react";
import { useReducedMotion } from "framer-motion";
import pack from "../../../../../../poc/backend/app/seed/packs/workplace-conversation.json";
import "./style.css";

const episode = pack.episodes.find((item) => item.order === 4);
const person = pack.characters.find((item) => item.id === episode.character_id);
const variants = [
  { id: "glass", name: "Clear Glass", label: "01 · 투명 유리", description: "얇은 빛 테두리와 어두운 투명 표면. 현재 미러 스타일과 가장 자연스럽게 연결됩니다." },
  { id: "chrome", name: "Studio Chrome", label: "02 · 반사형 크롬", description: "밝은 실버 반사와 짙은 글자. 중요한 안내를 더 강하게 강조하는 방향입니다." },
  { id: "metal", name: "Satin Metal", label: "03 · 무광 헤어라인", description: "회청색 금속 표면과 미세한 결. 유리보다 차분하고 단단한 인상을 줍니다." },
];

function Material({ id, reduced, shape }) {
  if (id === "glass") return <Glass shape={shape} cutout refraction={.2} aberration={0} thickness={.12} highlight={.12} fresnel={.08} tintColor="#aab6c6" tintIntensity={.08}>
    <LinearGradient colorA="#3d4654" colorB="#07090d" angle={125}/>
  </Glass>;
  if (id === "chrome") return <Chrome shape={shape} tint="#e1e5ec" warmColor="#c8cdd6" coolColor="#a1b0c2" bevelWidth={.012} speed={reduced ? 0 : .08}/>;
  return <BrushedMetal shape={shape} lightColor="#858f9e" darkColor="#151d29" grain={.1} roughness={.75} environment={.7} brushAngle={0} bevelWidth={.018} speed={reduced ? 0 : .08}/>;
}

function SampleCard({ variant, supported, reduced }) {
  const [state, setState] = useState("loading");
  const [shape, setShape] = useState({ type: "roundedRectSDF", width: .45, height: .49, rounding: .045 });
  const card = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setShape({ type: "roundedRectSDF", width: (width / 2 - 3) / height, height: .5 - 3 / height, rounding: 17 / height });
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  const ready = supported && state === "ready";
  return <article className={`sample sample-${variant.id}`}>
    <header><p>{variant.label}</p><h2>{variant.name}</h2></header>
    <div ref={card} className="material-card" data-render={ready ? "webgpu" : "fallback"}>
      {supported && state !== "unavailable" && <Shader className="material-canvas" aria-hidden="true" disableTelemetry colorSpace="srgb" onReady={() => setState("ready")} onUnavailable={() => setState("unavailable")}>
        <Material id={variant.id} reduced={reduced} shape={shape}/>
      </Shader>}
      <div className="card-content">
        <div className="scenario-heading">
          <p className="scene-label"><span className="scene-badge">업무</span><time>{episode.virtual_time}</time></p>
          <h3>처음 맡은 업무,<br/>마감은 오늘</h3>
        </div>
        <div className="scenario-context">
          <p className="situation">{episode.situation}</p>
          <dl className="conversation-partner"><div><dt>대화 상대</dt><dd>{person.name}</dd></div></dl>
        </div>
        <div className="scenario-focus"><p className="focus-label">이 장면에서 연습할 것</p><p>{episode.question_intent}</p></div>
      </div>
    </div>
    <p className="material-description">{variant.description}</p>
    <small className="render-status">{ready ? "● 실제 WebGPU 렌더링" : supported === null || (supported && state === "loading") ? "재질을 준비하고 있어요…" : "○ CSS 대체 표시 · 셰이더 효과 미지원"}</small>
  </article>;
}

function Samples() {
  const [supported, setSupported] = useState(null);
  const reduced = useReducedMotion();
  useEffect(() => { let active = true; getWebGPUSupport().then(({ supported }) => { if (active) setSupported(supported); }).catch(() => { if (active) setSupported(false); }); return () => { active = false; }; }, []);
  return <main className="samples-page">
    <header className="page-heading"><p>Mirror-Ting <span>/ SCENARIO OVERVIEW</span></p><h1>대화 전에, 상황을 한눈에.</h1><div>상황 요약 · 대화 상대 · 연습할 핵심을 담은 카드입니다.<br/>동일한 내용으로 세 가지 실버 재질을 비교해 보세요.</div></header>
    <section className="sample-grid" aria-label="셰이더 카드 비교">{variants.map(variant => <SampleCard key={variant.id} variant={variant} supported={supported} reduced={reduced}/>)}</section>
    <footer className="study-footer"><p><strong>추천 · 01 Clear Glass</strong><span>기존 실버 이미지와 조화를 이루며 상황 설명에 집중할 수 있습니다.</span></p><a href="../flow/4k.html?scene=work">현재 요약 화면 보기 ↗</a></footer>
    <p className="source-note">shaders 4.0.2 · 실제 시나리오 팩의 상황·상대·연습 목표 연결 · 제품 반영 전 비교 화면</p>
  </main>;
}
const root = createRoot(document.getElementById("root"));
root.render(<Samples/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
