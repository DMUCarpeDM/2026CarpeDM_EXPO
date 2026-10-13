export const AUTO_SUBMIT_SILENCE_MS = 1000;

export function shouldScheduleAutoSubmit({ receivedFinal, interimText }) {
  return receivedFinal || Boolean(interimText.trim());
}
