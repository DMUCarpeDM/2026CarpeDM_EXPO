// SVG adaptations inspired by Aceternity's Background Lines and Background Beams.
// Registry endpoints returned HTTP 403; these are not the upstream implementations.
import React, {useId} from 'react';
export function LineEffects({beams=false,paused=false}) {
 const id=useId();
 const paths=Array.from({length:beams?18:12},(_,i)=>beams?`M ${-300+i*65} -100 C ${300+i*40} 50 ${-250+i*100} 700 ${800+i*65} 950`:`M -100 ${170+i*32} C 200 ${-120+i*38} 400 ${900-i*24} 700 ${450+i*22} S 1100 ${-200+i*36} 1550 ${180+i*36}`);
 return <svg className={`central-svg ${beams?'central-beams':'central-lines'}`} data-paused={paused} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2358a7" stopOpacity="0"/><stop offset=".4" stopColor="#1686ff"/><stop offset=".65" stopColor="#a2d7ff"/><stop offset="1" stopColor="#2970df" stopOpacity="0"/></linearGradient></defs>{paths.map((d,i)=><g key={i}><path d={d} fill="none" stroke="#448de1" strokeOpacity={beams?.14:.18} strokeWidth="1"/><path className="central-trace" d={d} fill="none" stroke={`url(#${id})`} strokeWidth={beams?1.6:1.1} pathLength="100" style={{animationDelay:`${-i*1.2}s`,animationDuration:`${beams?12+i%4:18+i%5}s`}}/></g>)}</svg>
}
