/** Web Speech API 기반 음성 인식 (Chrome 계열, API 키 불필요).
 * 미지원 브라우저에서는 isSpeechRecognitionSupported()가 false → 텍스트 입력 폴백.
 */

export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

export class SpeechCapture {
  private recognition: SpeechRecognition | null = null;
  private finalText = '';
  private manualStop = false;

  start(onUpdate: (text: string, interim: string) => void, onError?: (msg: string) => void): boolean {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return false;
    this.finalText = '';
    this.manualStop = false;
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (result.isFinal) this.finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      onUpdate(this.finalText, interim);
    };
    rec.onerror = (ev) => {
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        onError?.(`음성 인식 오류: ${ev.error ?? '알 수 없음'}`);
      }
    };
    rec.onend = () => {
      // 침묵으로 자동 종료되면 사용자가 멈출 때까지 재시작
      if (!this.manualStop) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
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
