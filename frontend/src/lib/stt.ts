/** Web Speech API 기반 음성 인식 (Chrome 계열, API 키 불필요).
 * 미지원 브라우저에서는 isSpeechRecognitionSupported()가 false → 텍스트 입력 폴백.
 */
import { pingKioskActivity } from './kioskIdle';

export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

// 재시작해도 소용없는 종료성 오류 — 마이크 뽑힘·권한 회수·인식 서비스 차단.
// 이때 재시작하면 error→end→start의 CPU 공회전 루프가 되고 화면은 계속 "듣는 중"이다.
const TERMINAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

export class SpeechCapture {
  private recognition: SpeechRecognition | null = null;
  private finalText = '';
  private manualStop = false;
  private lastError = '';

  start(
    onUpdate: (text: string, interim: string) => void,
    onError?: (msg: string, fatal?: boolean) => void,
  ): boolean {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return false;
    this.finalText = '';
    this.manualStop = false;
    this.lastError = '';
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      pingKioskActivity(); // 답변 발화 중 = 세션 진행 중 (무조작 복귀 방지)
      this.lastError = '';
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (result.isFinal) this.finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      onUpdate(this.finalText, interim);
    };
    rec.onerror = (ev) => {
      this.lastError = ev.error ?? '';
      if (ev.error !== 'no-speech' && ev.error !== 'aborted' && !TERMINAL_ERRORS.has(ev.error ?? '')) {
        onError?.(`음성 인식 오류: ${ev.error ?? '알 수 없음'}`);
      }
    };
    rec.onend = () => {
      if (this.manualStop) return;
      if (TERMINAL_ERRORS.has(this.lastError)) {
        this.recognition = null;
        onError?.('마이크를 사용할 수 없어요. 연결을 확인하거나 텍스트로 입력해주세요.', true);
        return;
      }
      // 침묵으로 자동 종료되면 사용자가 멈출 때까지 재시작.
      // 짧은 지연으로, 즉시 실패가 반복되는 상황이 CPU 공회전이 되지 않게 한다.
      setTimeout(() => {
        if (this.manualStop) return;
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }, 250);
    };
    rec.start();
    this.recognition = rec;
    return true;
  }

  stop(): string {
    this.manualStop = true;
    this.recognition?.stop();
    this.recognition = null;
    return this.finalText.trim();
  }
}
