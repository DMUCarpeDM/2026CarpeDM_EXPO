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
  // 리액션→질문 체인이 onEnd로 이어지므로, end가 안 오면 대화가 멈춘다.
  // Chrome은 end 대신 error(synthesis-failed 등)로 끝나는 경우가 있어 error도
  // 진행으로 처리한다. 의도적 취소(stopSpeaking → interrupted/canceled)만 제외 —
  // 취소는 호출자가 이미 다음 단계를 알고 있다.
  let watchdog = 0;
  let settled = false;
  const settle = (advance: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(watchdog);
    pingKioskActivity();
    if (advance) opts.onEnd?.();
  };
  utterance.onend = () => settle(true);
  utterance.onerror = (ev) => settle(ev.error !== 'interrupted' && ev.error !== 'canceled');
  // end도 error도 오지 않는 드문 멈춤 대비 안전망 — 발화 길이에 비례한 상한
  watchdog = window.setTimeout(() => settle(true), 8_000 + text.length * 250);
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
