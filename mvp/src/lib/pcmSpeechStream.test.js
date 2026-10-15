import test from 'node:test';
import assert from 'node:assert/strict';
import { playPcmSpeechStream } from './pcmSpeechStream.js';

function environment(t) {
  const nodes=[];
  let closed=0;
  class Context {
    currentTime=0; state='running'; destination={};
    async resume() {}
    async close() { this.state='closed'; closed++; }
    createBuffer(_,count,rate) { const samples=new Float32Array(count); return {duration:count/rate,getChannelData:()=>samples}; }
    createBufferSource() { const node={connect(){},start(){nodes.push(node);},stop(){node.stopped=true;}}; return node; }
  }
  const prior=globalThis.window;
  globalThis.window={AudioContext:Context,setInterval,clearInterval,setTimeout,clearTimeout};
  t.after(()=>{globalThis.window=prior;});
  return {nodes,closed:()=>closed};
}

test('plays first PCM before stream ends, preserves split samples and waits for playback',async t=>{
  const env=environment(t);
  let input;
  const body=new ReadableStream({start(controller){input=controller;}});
  const abort=new AbortController();
  let started=0,finished=false;
  const playback=playPcmSpeechStream({body},{signal:abort.signal,textLength:10,onStart:()=>started++,onProgress(){}}).then(()=>{finished=true;});
  input.enqueue(new Uint8Array([0,64,0]));
  await new Promise(r=>setImmediate(r));
  assert.equal(started,1);
  assert.equal(finished,false);
  assert.equal(env.nodes[0].buffer.getChannelData(0)[0],.5);
  input.enqueue(new Uint8Array([192])); input.close();
  await new Promise(r=>setImmediate(r));
  assert.equal(env.nodes.length,2);
  assert.equal(env.nodes[1].buffer.getChannelData(0)[0],-.5);
  assert.equal(finished,false);
  for(const node of env.nodes)node.onended();
  await playback;
  assert.equal(finished,true);
  assert.equal(env.closed(),1);
});

test('cancellation stops scheduled audio and cancels a stalled stream',async t=>{
  const env=environment(t);
  let input,cancelled=false;
  const body=new ReadableStream({start(c){input=c;},cancel(){cancelled=true;}});
  const abort=new AbortController();
  const playback=playPcmSpeechStream({body},{signal:abort.signal,textLength:10,onStart(){},onProgress(){}});
  input.enqueue(new Uint8Array([0,64]));
  await new Promise(r=>setImmediate(r));
  abort.abort();
  await assert.rejects(playback,{name:'AbortError'});
  assert.ok(cancelled);
  assert.ok(env.nodes[0].stopped);
});

test('a stream stalled after first audio releases the microphone and audio resources',async t=>{
  const env=environment(t);
  let input,cancelled=false,timeout;
  window.setTimeout=callback=>{timeout=callback;return 1;};
  window.clearTimeout=()=>{};
  const body=new ReadableStream({start(c){input=c;},cancel(){cancelled=true;}});
  const playback=playPcmSpeechStream({body},{signal:new AbortController().signal,textLength:10,onStart(){},onProgress(){}});
  input.enqueue(new Uint8Array([0,64]));
  await new Promise(r=>setImmediate(r));
  timeout();
  await assert.rejects(playback,/Speech stream stalled/);
  assert.ok(cancelled);
  assert.ok(env.nodes[0].stopped);
  assert.equal(env.closed(),1);
});
