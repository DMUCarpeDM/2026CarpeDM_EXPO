// 마지막 발화 종료부터 2초간 새 발화가 없을 때 답변을 전송한다.
export const AUTO_SUBMIT_DELAY_MS = 2000;

export function shouldScheduleAutoSubmit({ receivedFinal, interimText }) {
  return receivedFinal && !interimText.trim();
}
