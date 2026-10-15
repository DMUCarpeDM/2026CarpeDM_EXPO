export const AUTO_SUBMIT_DELAY_MS = 750;

export function shouldScheduleAutoSubmit({ receivedFinal, interimText }) {
  return receivedFinal && !interimText.trim();
}
