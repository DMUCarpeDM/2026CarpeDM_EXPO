import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FitAnalysisPages } from '../components/home/FitAnalysisPages';
import '../styles.css';
import '../styles/brand-mark.css';
import '../styles/service-introduction.css';
import '../styles/lovable-layout.css';
import './fit-background-preview.css';
const variants = [['stripe','01 그리드 + 블루 빛'],['bolt','02 도트 필드'],['raycast','03 사선 빛']];
function App() {
 const [background,setBackground] = useState(() => variants.some(([id])=>id===new URLSearchParams(location.search).get('background')) ? new URLSearchParams(location.search).get('background') : 'stripe');
 useEffect(() => { const update = () => setBackground(new URLSearchParams(location.search).get('background') || 'stripe'); addEventListener('popstate',update); return () => removeEventListener('popstate',update); },[]);
 const change = id => { setBackground(id);const url=new URL(location.href);url.searchParams.set('background',id);history.pushState({},'',url); };
 return <div className={`fit-background-preview background-${background}`}><header className="fb-header"><a href="/" className="fb-brand"><img src="/icons/mirror-ting-mark-slim.png" alt="" />Mirror-Ting</a><div className="fb-variants" role="group" aria-label="배경 시안">{variants.map(([id,label])=><button type="button" key={id} aria-pressed={background===id} onClick={()=>change(id)}>{label}</button>)}</div><span>아래로 스크롤 ↓</span></header><main className="app-shell"><section className="service-introduction" aria-label="기존 4-Fit 배경 비교"><FitAnalysisPages mode="background-preview" /></section></main><footer className="fb-footer"><p>기존 타이포그래피·아이콘·스크롤 전환을 유지한 배경 비교 시안</p><button type="button" onClick={()=>scrollTo({top:0,behavior:'instant'})}>처음부터 보기 ↑</button></footer></div>;
}
createRoot(document.getElementById('root')).render(<App />);
