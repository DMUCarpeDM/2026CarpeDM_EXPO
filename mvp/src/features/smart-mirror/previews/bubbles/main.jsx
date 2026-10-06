import React from "react";
import { createRoot } from "react-dom/client";
import { WorkplacePixelOffice } from "../../components/WorkplacePixelOffice";
import "../../styles/workplace-mirror-flow.css";
import "./bubbles.css";
const options=[{id:"glass",name:"01 · 실버 글래스",note:"추천 · 기존 표면과 어울리는 작고 부드러운 말풍선"},{id:"pixel",name:"02 · 픽셀 윈도",note:"계단식 모서리로 픽셀 장면과 형태를 맞춘 대화 창"},{id:"caption",name:"03 · 대화 자막",note:"이름과 대사를 가로로 정리해 장면을 덜 가리는 자막"}];
const params=new URLSearchParams(location.search);
const selected=options.find(o=>o.id===params.get("bubble"));
function App(){
 if(selected) return <main className="bubble-sample"><header><p>{selected.name}</p><h1>출근 장면의 대화</h1></header><WorkplacePixelOffice phase={{kind:"scene",scene:0,progress:.35}} reduced visible bubbleStyle={selected.id}/></main>;
 return <main className="bubble-gallery"><header><p>Mirror-Ting · 말풍선 컴포넌트</p><h1>같은 대사, 세 가지 말풍선.</h1><p>기존 은색 팔레트와 픽셀 아트를 유지한 디자인 비교입니다.</p></header><div className="bubble-grid">{options.map(o=><article key={o.id}><iframe src={`?bubble=${o.id}`} title={o.name} tabIndex={-1}/><h2>{o.name}</h2><p>{o.note}</p><a href={`?bubble=${o.id}`}>{o.name.slice(5)} 크게 보기</a></article>)}</div></main>;
}
createRoot(document.getElementById("root")).render(<App/>);
