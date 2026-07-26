export function shouldScheduleAutoSubmit({ receivedFinal, interimText }) {
  return receivedFinal && !interimText.trim();
}
