import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PracticePage} from '/src/pages/PracticePage.jsx';
import {submitResponse} from '/src/lib/pocApi.js';
const control=window.practice={recorders:[],recognitions:[],players:[],retained:[],cues:[]};
const context=new AudioContext();await context.resume();
const destination=context.createMediaStreamDestination();
const oscillator=context.createOscillator();oscillator.connect(destination);oscillator.start();
const stream=destination.stream;
const createOscillator=AudioContext.prototype.createOscillator;
AudioContext.prototype.createOscillator=function(...args){
 const oscillator=createOscillator.apply(this,args),start=oscillator.start.bind(oscillator);
 oscillator.start=(...args)=>{
  control.cues.push({recording:control.recorders.at(-1)?.state==='recording',recognizing:Boolean(control.recognitions.at(-1)?.onresult),aiPlaying:control.players.at(-1)?.playing});
  return start(...args);
 };
 return oscillator;
};
stream.getAudioTracks()[0].getSettings=()=>({deviceId:'usb-test',sampleRate:48000,channelCount:1,autoGainControl:false});
window.MediaRecorder=class {
 static isTypeSupported(){return true;}
 constructor(stream){this.stream=stream;this.state='inactive';this.mimeType='audio/wav';control.recorders.push(this);this.id=control.recorders.length;}
 start(){this.state='recording';}
 requestData(){}
 stop(){
  if(this.state==='inactive')throw new Error('recorder stopped twice');
  this.state='inactive';
  const buffer=new ArrayBuffer(16044),view=new DataView(buffer);
  const text=(offset,value)=>[...value].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,16036,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,16000,true);
  for(let offset=44;offset<buffer.byteLength;offset+=2)view.setInt16(offset,this.id*1000,true);
  setTimeout(()=>{this.ondataavailable?.({data:new Blob([buffer],{type:'audio/wav'})});this.onstop?.();},30);
 }
};
window.SpeechRecognition=class {
 start(track){this.track=track;this.recordingReady=control.recorders.at(-1)?.state==='recording';control.recognitions.push(this);this.onstart?.();}
 abort(){this.aborted=true;}
 result(text,final=true){const result=[{transcript:text}];result.isFinal=final;this.onresult?.({resultIndex:0,results:[result]});}
};
window.Audio=class {
 duration=1;currentTime=0;
 constructor(){control.players.push(this);}
 async play(){this.playing=true;this.onplay?.();this.onplaying?.();}
 pause(){this.playing=false;}
};
const scenario={slug:'workplace-conversation',title:'업무 대화',characters:[{id:'c',name:'선배'}]};
const session={id:91,access_token:'turn-test',scenario,interaction:{mode:'workplace_continuous'},voice_analysis:{engine_version:'voice-measure-v2',calibration:{status:'standard',source:'standard',can_proceed:true}}};
const tracking={status:'idle',collectTurnStats:()=>null};
const activity=()=>{};
function Harness(){
 const [turn,setTurn]=useState({id:101,order:1,character_id:'c',question_text:'첫 질문입니다.'});
 const [history,setHistory]=useState([]),[busy,setBusy]=useState(false);
 const video=useRef(null),overlay=useRef(null),idle=useRef(false);
 control.refreshTurn=()=>setTurn(previous=>({...previous}));
 const onSubmit=async input=>{
  setBusy(true);
  try{
   const result=await submitResponse(session,turn.id,input);
   void input.audioReady.then(audio=>control.retained.push({turnId:turn.id,size:audio?.size||0}));
   setHistory(items=>[...items,{...turn,response_text:input.text}]);setTurn(result.next_turn);
  }finally{setBusy(false);}
 };
 return React.createElement(PracticePage,{session,scenario,turn,history,busy,onSubmit,mediaStream:stream,
  aiHealth:{dialogue_ready:true,tts_ready:true},track:tracking,analysisVideoRef:video,overlayRef:overlay,idlePausedRef:idle,onVisitorActivity:activity});
}
createRoot(document.querySelector('#root')).render(React.createElement(Harness));
