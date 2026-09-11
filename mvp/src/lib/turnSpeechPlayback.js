import { synthesizeSpeech } from "./pocApi.js";

// 반환한 정리 함수는 질문 변경·일시정지·화면 이탈 시 호출한다.
export function startTurnSpeech({ text, serverTtsReady, onSpeakingChange, onFinish, onNote }) {
  const synth = window.speechSynthesis;
  let cancelled = false;
  let browserSpeechStarted = false;
  let speakTimer = 0;
  let audio = null;
  let audioUrl = "";
  const finishSpeaking = () => {
    if (!cancelled) {
      onSpeakingChange(false);
      onFinish();
    }
  };
  const speakWithBrowser = () => {
    if (cancelled || browserSpeechStarted) return;
    browserSpeechStarted = true;
    if (!synth) {
      onNote("음성 재생을 지원하지 않는 브라우저예요 — 질문은 자막으로 표시돼요");
      finishSpeaking();
      return;
    }
    const voices = synth.getVoices();
    const koVoice = voices.find((v) => v.lang?.startsWith("ko") && v.localService) || voices.find((v) => v.lang?.startsWith("ko")) || null;
    // 한국어 음성이 아예 없으면 무음·이상 발음의 원인 — 화면에 바로 알려 조치 가능하게 한다
    if (voices.length > 0 && !koVoice) onNote("한국어 TTS 음성이 없어요 — Windows 설정 > 시간 및 언어에서 한국어 음성 설치 필요");
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = koVoice;
    utter.lang = "ko-KR";
    utter.rate = 1.04;
    utter.volume = 1;
    utter.onstart = () => {
      if (cancelled) return;
      onSpeakingChange(true);
      onNote("AI 음성 재생 시작 — 소리가 안 들리면 Windows 소리 출력 장치를 확인하세요");
    };
    utter.onend = finishSpeaking;
    utter.onerror = (event) => {
      if (!cancelled) onNote(`음성 합성 오류(${event?.error || "unknown"}) — 소리 출력 장치를 확인하세요`);
      finishSpeaking();
    };
    synth.speak(utter);
  };
  const startBrowserSpeech = () => {
    if (!synth) {
      speakWithBrowser();
      return;
    }
    const onVoicesChanged = () => speakWithBrowser();
    if (synth.getVoices().length === 0 && typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", onVoicesChanged, { once: true });
      speakTimer = window.setTimeout(speakWithBrowser, 400);
    } else {
      speakTimer = window.setTimeout(speakWithBrowser, 80);
    }
  };
  const playElevenLabsSpeech = async () => {
    try {
      const blob = await synthesizeSpeech(text);
      if (cancelled) return;
      audioUrl = URL.createObjectURL(blob);
      audio = new Audio(audioUrl);
      audio.onplay = () => {
        if (!cancelled) {
          onSpeakingChange(true);
          onNote("AI 음성 재생 시작");
        }
      };
      audio.onended = finishSpeaking;
      audio.onerror = () => {
        if (!cancelled) {
          onNote("AI 음성 재생에 실패해 브라우저 음성으로 전환해요");
          startBrowserSpeech();
        }
      };
      await audio.play();
    } catch {
      if (!cancelled) {
        onNote("AI 음성 연결이 안 돼 브라우저 음성으로 전환해요");
        startBrowserSpeech();
      }
    }
  };
  // 음성 재생이 시작되는 동안에도 상대 영상이 즉시 speaking 상태로 보인다.
  onSpeakingChange(true);
  synth?.cancel();
  if (serverTtsReady) {
    void playElevenLabsSpeech();
  } else {
    startBrowserSpeech();
  }
  return () => {
    cancelled = true;
    window.clearTimeout(speakTimer);
    if (audio) audio.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    synth?.cancel();
    onSpeakingChange(false);
  };
}
