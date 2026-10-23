// Adapted from the public component specifications at:
// https://ui.aceternity.com/components/grid-and-dot-backgrounds
// https://ui.aceternity.com/components/spotlight-new
// The registry endpoint did not return source; these two versions reproduce the
// documented CSS pattern / three-gradient mirrored spotlight in project CSS.
import React from 'react';
import { motion } from 'framer-motion';
export function GridAndDots() { return <div className="aceternity-grid-dots"><div className="aceternity-grid"/><div className="aceternity-dots"/></div>; }
export function SpotlightNew({paused=false}) {
 return <div className="aceternity-spotlights">{[-1,1].map(side=><motion.div key={side} className={`aceternity-spotlight side-${side}`} initial={false} animate={{x:paused?0:[0,side*100,0]}} transition={{duration:7,repeat:paused?0:Infinity,ease:'easeInOut'}}>{[0,1,2].map(index=><div key={index} className={`spotlight-beam beam-${index}`}/>)}</motion.div>)}</div>;
}
