import { playPcmSpeechStream } from "./pcmSpeechStream.js";
import { synthesizeSpeech } from "./pocApi.js";

// 반환한 정리 함수는 질문 변경·일시정지·화면 이탈 시 호출한다.
export function startTurnSpeech({ text, voice = "female", serverTtsReady, preparedAudioUrl, onSpeakingChange, onFinish, onNote, onProgress }) {
  if (!text?.trim()) {
    onSpeakingChange(false);
    onProgress?.({ text, status: "ended", charIndex: text?.length || 0 });
    onFinish();
    return () => {};
  }
  const synth = window.speechSynthesis;
  const speechRequest = new AbortController();
  let cancelled = false;
  let browserSpeechStarted = false;
  let speakTimer = 0;
  let audio = null;
  let audioUrl = "";
  let progressTimer = 0;
  const report = (status, charIndex = 0) => {
    if (!cancelled) onProgress?.({ text, status, charIndex });
  };
  const finishSpeaking = () => {
    if (!cancelled) {
      window.clearInterval(progressTimer);
      if (audio) audio.ontimeupdate = audio.onplaying = null;
      report("ended", text.length);
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
      report("unavailable");
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
      report("playing");
      // Korean browser voices may omit boundary events; keep an estimated fallback.
      let index = 0;
      if (onProgress) progressTimer = window.setInterval(() => {
        index = Math.min(text.length - 1, index + 1);
        report("playing", index);
      }, 140);
      utter.onboundary = (event) => {
        window.clearInterval(progressTimer);
        report("playing", event.charIndex);
      };
      onNote("AI 음성 재생 시작 — 소리가 안 들리면 Windows 소리 출력 장치를 확인하세요");
    };
    utter.onend = finishSpeaking;
    utter.onerror = (event) => {
      if (!cancelled) onNote(`음성 합성 오류(${event?.error || "unknown"}) — 소리 출력 장치를 확인하세요`);
      finishSpeaking();
      report("unavailable");
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
  const playServerSpeech = async () => {
    let streamStarted = false;
    try {
      const response = preparedAudioUrl ? null : await synthesizeSpeech(text, voice, speechRequest.signal, true);
      if (cancelled) return;
      if (response?.headers?.get("content-type")?.includes("audio/pcm")) {
        await playPcmSpeechStream(response, {
          signal: speechRequest.signal, textLength: text.length,
          onStart: () => { streamStarted = true; onSpeakingChange(true); report("playing"); onNote("AI 음성 스트리밍 재생 시작"); },
          onProgress: index => report("playing", index),
        });
        finishSpeaking();
        return;
      }
      if (response) {
        const blob = await response.blob();
        if (cancelled) return;
        audioUrl = URL.createObjectURL(blob);
      }
      audio = new Audio(preparedAudioUrl || audioUrl);
      let playbackStarted = false;
      const updateProgress = () => {
        if (!playbackStarted) return;
        // Iris returns audio without alignment metadata. Follow its playback clock,
        // estimating sentence boundaries from each sentence's character share.
        const ratio = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
        report("playing", Math.min(text.length - 1, Math.floor(ratio * text.length)));
      };
      audio.onplaying = () => { playbackStarted = true; updateProgress(); };
      audio.ontimeupdate = updateProgress;
      audio.onplay = () => {
        if (!cancelled) {
          onSpeakingChange(true);
          onNote("AI 음성 재생 시작");
        }
      };
      audio.onended = finishSpeaking;
      audio.onerror = () => {
        if (!cancelled) {
          audio.ontimeupdate = audio.onplaying = null;
          report("waiting");
          onNote("AI 음성 재생에 실패해 브라우저 음성으로 전환해요");
          startBrowserSpeech();
        }
      };
      await audio.play();
    } catch {
      if (!cancelled) {
        if (streamStarted) {
          onNote("음성 연결이 끊겼어요. 남은 내용은 자막으로 확인해 주세요.");
          finishSpeaking();
          return;
        }
        onNote("AI 음성 연결이 안 돼 브라우저 음성으로 전환해요");
        startBrowserSpeech();
      }
    }
  };
  // 음성 재생이 시작되는 동안에도 상대 영상이 즉시 speaking 상태로 보인다.
  onSpeakingChange(true);
  report("waiting");
  synth?.cancel();
  if (preparedAudioUrl || serverTtsReady) {
    void playServerSpeech();
  } else {
    startBrowserSpeech();
  }
  return () => {
    cancelled = true;
    speechRequest.abort();
    window.clearTimeout(speakTimer);
    window.clearInterval(progressTimer);
    onProgress?.({ text, status: "cancelled", charIndex: 0 });
    if (audio) audio.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    synth?.cancel();
    onSpeakingChange(false);
  };
}
