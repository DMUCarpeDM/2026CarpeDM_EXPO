import {useEffect} from 'react';
import {transcribeRecording} from './pocApi.js';

// Browser recognition can fail in embedded Chromium. Local Whisper is the fallback.
export function useServerStt({enabled,stream,session,onText,onListening,onError}) {
  useEffect(()=>{
    if(!enabled || !session?.access_token || !stream?.getAudioTracks?.().some(t=>t.readyState==='live')) return;
    let disposed=false,recorder,timer,context,source,request,active=false,started=0,lastVoice=0,processing=false;
    const AudioCtx=window.AudioContext || window.webkitAudioContext;
    if(!AudioCtx || !window.MediaRecorder){onError('음성 입력을 지원하는 Chrome에서 실행해 주세요.');return;}
    try {
      context=new AudioCtx();source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=1024;source.connect(analyser);const samples=new Float32Array(1024);
      void context.resume().catch(()=>{});onListening(true);
      timer=setInterval(()=>{
        if(disposed || processing)return;
        analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length),now=performance.now();
        if(rms>.015){lastVoice=now;if(!active){active=true;started=now;const chunks=[];const type=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';recorder=new MediaRecorder(new MediaStream(stream.getAudioTracks()),{mimeType:type});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=async()=>{if(disposed)return;processing=true;active=false;onListening(false);request=new AbortController();try{const result=await transcribeRecording(session,new Blob(chunks,{type}),request.signal);if(!disposed && result.text?.trim())onText(result.text.trim());}catch{if(!disposed)onError('음성 인식 연결을 확인하고 다시 말해 주세요.');}finally{processing=false;if(!disposed)onListening(true);}};recorder.start();}}
        if(active && ((now-lastVoice>900 && now-started>300)||now-started>20000)){active=false;processing=true;recorder.stop();}
      },100);
    }catch{onError('마이크 연결을 확인해 주세요.');}
    return()=>{disposed=true;clearInterval(timer);request?.abort();if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}source?.disconnect();void context?.close().catch(()=>{});onListening(false);};
  },[enabled,stream,session?.id]);
}
