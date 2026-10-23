import React from 'react';
import { createRoot } from 'react-dom/client';
import { FitAnalysisPages } from '../components/home/FitAnalysisPages';
import '../styles.css';
import '../styles/brand-mark.css';
import '../styles/service-introduction.css';
import './fit-blue-preview.css';
const paths = [
 'M20 24h56a8 8 0 0 1 8 8v32a8 8 0 0 1-8 8H48L28 86V72h-8a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8ZM30 42h36M30 54h24',
 'M12 44v12M24 32v36M36 20v60M48 36v28M60 12v76M72 28v44M84 40v20',
 'M22 32v-8a8 8 0 0 1 8-8h40a8 8 0 0 1 8 8v8M22 68v8a8 8 0 0 0 8 8h40a8 8 0 0 0 8-8v-8M34 40h2M64 40h2M36 60q14 14 28 0',
 'M60 24a12 12 0 1 1-24 0a12 12 0 1 1 24 0ZM20 84v-8a28 28 0 0 1 56 0v8M48 48v36M28 60h40',
];
function FitIcon({index}) { return <svg viewBox="0 0 96 100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[index]}/></svg>; }
createRoot(document.getElementById('root')).render(<div className="fit-blue-preview"><header className="fit-blue-header"><a href="/"><img src="/icons/mirror-ting-mark-slim.png" alt=""/>Mirror-Ting</a><span>4-Fit · Blue 시안</span><a href="#blue-fit-start">스크롤해서 보기 ↓</a></header><main className="app-shell"><section className="service-introduction fit-blue-section" id="blue-fit-start"><FitAnalysisPages mode="blue-draft" renderIcon={index => <FitIcon index={index}/>} /></section></main><footer className="fit-blue-end"><span>기존 스크롤 전환 유지 · 미러팅 블루 #0069EC · 라인 아이콘</span><a href="#blue-fit-start">처음부터 보기 ↑</a></footer></div>);
