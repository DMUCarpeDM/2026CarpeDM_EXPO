/** 브라우저 내장 speechSynthesis 기반 캐릭터 음성 (API 키 불필요). */
import { pingKioskActivity } from './kioskIdle';

let koVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (koVoice) return koVoice;
  const voices = speechSynthesis.getVoices();
  koVoice =
    voices.find((v) => v.lang === 'ko-KR' && v.localService) ??
    voices.find((v) => v.lang === 'ko-KR') ??
    voices.find((v) => v.lang.startsWith('ko')) ??
    null;
  return koVoice;
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => {
    koVoice = null;
    pickVoice();
  };
}

export function speak(
  text: string,
  opts: { rate?: number; pitch?: number; onStart?: () => void; onEnd?: () => void } = {},
): void {
  if (typeof speechSynthesis === 'undefined') {
    opts.onEnd?.();
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = opts.rate ?? 1.0;
  utterance.pitch = opts.pitch ?? 1.0;
  utterance.onstart = () => {
    pingKioskActivity(); // 상대가 말하는 중 = 세션 진행 중 (무조작 복귀 방지)
    opts.onStart?.();
  };
  utterance.onend = () => {
    pingKioskActivity();
    opts.onEnd?.();
  };
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
