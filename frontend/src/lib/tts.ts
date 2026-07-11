/** 브라우저 내장 speechSynthesis 기반 캐릭터 음성 (API 키 불필요). */
import { isOfflineMode } from './offlineMode';
import { pingKioskActivity } from './kioskIdle';

// 두 후보를 캐시: 로컬(OS 내장, 오프라인 가능)과 임의(네트워크 폴백 포함).
// 오프라인 모드에서는 로컬만 쓰고, 아니면 로컬 우선·네트워크 폴백.
let localKoVoice: SpeechSynthesisVoice | null = null;
let anyKoVoice: SpeechSynthesisVoice | null = null;
let resolved = false;

function resolveVoices(): void {
  if (resolved && localKoVoice !== null) return;
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return; // 아직 로드 전 — onvoiceschanged가 다시 부른다
  localKoVoice =
    voices.find((v) => v.lang === 'ko-KR' && v.localService) ??
    voices.find((v) => v.lang.startsWith('ko') && v.localService) ??
    null;
  anyKoVoice =
    localKoVoice ??
    voices.find((v) => v.lang === 'ko-KR') ??
    voices.find((v) => v.lang.startsWith('ko')) ??
    null;
  resolved = true;
}

/** 실제 발화에 쓸 음성. 오프라인 모드면 로컬 음성만(없으면 null → OS 기본 폴백). */
function pickVoice(): SpeechSynthesisVoice | null {
  resolveVoices();
  return isOfflineMode() ? localKoVoice : anyKoVoice;
}

/** 전시 준비 점검용 — TTS가 인터넷 없이 동작 가능한지의 상태.
 *   local   OS 내장 한국어 음성 있음 → 완전 오프라인 가능
 *   network 한국어 음성이 네트워크(예: Google)뿐 → 인터넷 필요
 *   none    한국어 음성 자체가 없음 → 영어 기본 음성으로 폴백됨
 *   pending 음성 목록 로드 전 (잠시 후 재확인)
 */
export function koreanVoiceStatus(): 'local' | 'network' | 'none' | 'pending' {
  if (typeof speechSynthesis === 'undefined') return 'none';
  resolveVoices();
  if (!resolved) return 'pending';
  if (localKoVoice) return 'local';
  return anyKoVoice ? 'network' : 'none';
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => {
    resolved = false;
    localKoVoice = null;
    anyKoVoice = null;
    resolveVoices();
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
