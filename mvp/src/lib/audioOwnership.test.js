import test from 'node:test';
import assert from 'node:assert/strict';
import {claimAudio} from './audioOwnership.js';
function scope(){const doc=new EventTarget();doc.hidden=false;return {document:doc};}
test('a new source stops the previous one and old cleanup cannot release the new owner',t=>{t.mock.method(globalThis,'setTimeout',setTimeout);const old=globalThis.window;globalThis.window=scope();t.after(()=>{globalThis.window=old;});let a=0,b=0;const releaseA=claimAudio(()=>a++);const releaseB=claimAudio(()=>b++);assert.equal(a,1);releaseA();window.document.hidden=true;window.document.dispatchEvent(new Event('visibilitychange'));assert.equal(b,1);releaseB();});
test('same-origin tab claims interrupt older tab audio',t=>{const old=globalThis.window;t.after(()=>{globalThis.window=old;});const peers=new Set();class Channel{constructor(){peers.add(this);}postMessage(){for(const p of [...peers])if(p!==this)p.onmessage?.();}close(){peers.delete(this);}}
 const a=scope(),b=scope();a.BroadcastChannel=b.BroadcastChannel=Channel;let stopped=0;globalThis.window=a;claimAudio(()=>stopped++);globalThis.window=b;const release=claimAudio(()=>{});assert.equal(stopped,1);release();assert.equal(peers.size,0);});
test('hidden tabs cannot steal active audio',t=>{const old=globalThis.window;globalThis.window=scope();t.after(()=>{globalThis.window=old;});let stopped=0;const release=claimAudio(()=>stopped++);window.document.hidden=true;claimAudio(()=>{});assert.equal(stopped,0);release();});
