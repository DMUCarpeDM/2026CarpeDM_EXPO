// 브라우저 확정 뒤에는 React 초안 반영을 위한 다음 작업만 기다린다. 별도 무음 타이머는 두지 않는다.
export const AUTO_SUBMIT_DELAY_MS = 0;

export function shouldScheduleAutoSubmit({ receivedFinal, interimText }) {
  return receivedFinal && !interimText.trim();
}
