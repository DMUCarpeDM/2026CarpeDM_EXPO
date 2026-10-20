import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {homeFitSnapshot} from '../data/homeContent';
import '../styles/brand-mark.css';
import './fit-motion-preview.css';
const variants=[
 ['페이드','고정된 자리에서 아이콘과 설명이 부드럽게 교체돼요.'],
 ['세로 슬라이드','스크롤 방향을 따라 다음 분석 분야가 올라와요.'],
 ['가로 슬라이드','세로로 스크롤하면 분석 분야가 가로로 이동해요.'],
 ['카드 스택','다음 카드가 앞에 놓이며 분석 분야를 이어가요.'],
 ['고정 아이콘','설명을 읽어 내려가면 옆의 아이콘이 바뀌어요.']
];
const copy=[
 ['Response-Fit','하고 싶은 말이 또렷하게 전달되도록.','질문의 의도를 이해하고 핵심과 근거를 연결했는지 살펴봐요.'],
 ['Voice-Fit','내 말이 편안하게 들리도록.','말하는 속도와 음량, 문장 사이의 멈춤을 돌아봐요.'],
 ['Expression-Fit','말할 때의 표정도 돌아볼 수 있도록.','감정이나 의도를 단정하지 않고, 대화 중 표정의 변화를 살펴봐요.'],
 ['Posture-Fit','편안하고 안정적인 자세로 말하도록.','몸의 기울어짐과 반복되는 움직임을 살펴봐요.']
];
function Text({index}){return <div className="fm-copy"><span>{homeFitSnapshot[index].short} · {copy[index][0]}</span><h2>{copy[index][1]}</h2><p>{copy[index][2]}</p></div>}
function App(){
 const [variant,setVariant]=useState(0),[progress,setProgress]=useState(0),[chosen,setChosen]=useState(()=>localStorage.getItem('mirror-fit-motion-choice'));
 const [reduced,setReduced]=useState(()=>matchMedia("(prefers-reduced-motion: reduce)").matches);
 useEffect(()=>{const mq=matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReduced(mq.matches);mq.addEventListener("change",update);return()=>mq.removeEventListener("change",update)},[]);
 const area=useRef(null);const active=Math.min(3,Math.round(progress*3));
 useEffect(()=>{let frame=0;const update=()=>{frame=0;if(!area.current)return;if(variant===4){let closest=0,distance=Infinity;area.current.querySelectorAll('.fm-reading-text article').forEach((node,index)=>{const rect=node.getBoundingClientRect();const d=Math.abs(rect.top+rect.height/2-innerHeight*(innerWidth<760?.68:.5));if(d<distance){closest=index;distance=d}});setProgress(closest/3);return;}const r=area.current.getBoundingClientRect();const travel=r.height-(innerHeight-144);setProgress(Math.max(0,Math.min(1,(144-r.top)/Math.max(1,travel))))};const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);schedule();return()=>{cancelAnimationFrame(frame);removeEventListener('scroll',schedule);removeEventListener('resize',schedule)}},[variant]);
 const change=index=>{setVariant(index);requestAnimationFrame(()=>scrollTo({top:Math.max(0,area.current.offsetTop-144),behavior:'instant'}))};
 return <><header className="fm-header"><a href="/" className="fm-brand"><img src="/icons/mirror-ting-mark-slim.png" alt=""/>Mirror-Ting</a><span>4-Fit 스크롤 시안</span><button className="fm-choose" onClick={()=>{localStorage.setItem('mirror-fit-motion-choice',String(variant));setChosen(String(variant))}}>{chosen===String(variant)?'선택됨 ✓':'이 시안 선택'}</button></header><nav className="fm-picker" aria-label="스크롤 시안 선택">{variants.map(([name],i)=><button key={name} aria-pressed={variant===i} onClick={()=>change(i)}><small>0{i+1}</small>{name}</button>)}</nav><main><div className="fm-intro"><span>4-Fit · Motion study 0{variant+1}</span><h1>{variants[variant][0]}</h1><p>{variants[variant][1]}</p><small>아래로 스크롤하여 4가지 분석 분야를 확인하세요.</small></div><section ref={area} className={`fm-runway fm-variant-${variant}`} aria-label={variants[variant][0]} data-active-fit={active}>
 {variant===4?<div className="fm-reading"><div className="fm-reading-art" aria-hidden="true">{homeFitSnapshot.map((fit,i)=><img key={fit.tone} src={fit.image} alt="" style={{opacity:active===i?1:0,transform:`translateY(${active===i?0:12}px)`}}/>)}</div><div className="fm-reading-text">{copy.map((_,i)=><article key={i}><Text index={i}/></article>)}</div></div>:<div className="fm-stage">{homeFitSnapshot.map((fit,i)=>{
 const delta=i-progress*3;let transform='none',opacity=active===i?1:0;
 if(variant===1){transform=`translateY(${delta*105}%)`;opacity=Math.max(0,1-Math.abs(delta)*.6)}
 if(variant===2){transform=`translateX(${delta*110}%)`;opacity=1}
 if(variant===3){transform=`translateY(${Math.max(0,delta)*95}%) scale(${delta<0?Math.max(.88,1+delta*.04):1})`;opacity=delta<0?Math.max(0,1+delta):1}
 return <article key={fit.tone} className="fm-panel" aria-hidden={!reduced && active!==i} style={{transform,opacity,zIndex:variant===3?i:active===i?5:0,visibility:Math.abs(delta)>1.5?'hidden':'visible'}}><img className="fm-icon" src={fit.image} alt=""/><Text index={i}/></article>
 })}<span className="fm-count" aria-hidden="true">0{active+1} / 04</span></div>}
 </section><footer className="fm-end"><h2>어떤 흐름이 가장 자연스러웠나요?</h2><p role="status">{chosen!==null?`선택한 시안: 0${Number(chosen)+1} ${variants[Number(chosen)][0]}`:'상단에서 마음에 드는 시안을 선택하세요.'}</p><button onClick={()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}>다시 비교하기 ↑</button><p>선택은 이 브라우저에 저장됩니다. 실제 메인 화면에는 아직 적용하지 않습니다.</p></footer></main></>}
createRoot(document.getElementById('root')).render(<App/>);
