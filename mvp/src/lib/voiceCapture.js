const captures = new WeakMap();

export function captureSettings(stream) {
  const track = stream?.getAudioTracks?.()[0];
  if (!track || track.readyState !== "live") return null;
  if (!captures.has(track)) captures.set(track, crypto.randomUUID());
  const settings = track.getSettings?.() || {};
  return {
    capture_id: captures.get(track), device_id: settings.deviceId || "",
    sample_rate: settings.sampleRate ?? null, channel_count: settings.channelCount ?? null,
    auto_gain_control: settings.autoGainControl ?? null,
    noise_suppression: settings.noiseSuppression ?? null,
    echo_cancellation: settings.echoCancellation ?? null,
  };
}

export function sameCapture(baseline, current) {
  return Boolean(baseline && current && baseline.capture_id && baseline.device_id && current.capture_id && current.device_id
    && Object.keys(current).every((key) => baseline[key] === current[key]));
}

export const voiceReason = (reason) => ({
  calibration_required: "마이크 확인이 필요해요.",
  capture_changed: "마이크 연결이나 설정이 바뀌었어요. 다시 확인해 주세요.",
  automatic_gain_unverified: "마이크 자동 음량 조절을 끄거나 다른 마이크를 선택해 주세요.",
  capture_unknown: "마이크 설정을 확인하지 못했어요. 다시 연결해 주세요.",
  clipping: "녹음 소리가 잘렸어요. 입력 음량을 낮추거나 마이크를 조금 멀리해 주세요.",
  insufficient_speech: "말소리가 충분히 녹음되지 않았어요. 문장을 끝까지 읽어 주세요.",
  speech_in_noise_sample: "주변 소음 확인 중 말소리가 들렸어요. 조용할 때 다시 시작해 주세요.",
  noise_sample_invalid: "주변 소음을 다시 녹음해 주세요.",
  background_noise: "주변 소음이 커요. 조용한 곳이나 가까운 마이크에서 다시 확인해 주세요.",
  no_speech: "확인할 말소리가 없어요.",
  audio_missing: "녹음 자료가 없어요.",
  transcription_unavailable: "받아쓰기 결과가 없어 속도를 확인하지 못했어요.",
  pronunciation_ambiguous: "숫자나 외국어의 발음을 확인하지 못해 속도 판단을 보류했어요.",
  transcript_quality: "받아쓰기 품질이 충분하지 않아요.",
  insufficient_transcript_coverage: "받아쓴 내용과 말한 구간을 충분히 맞추지 못했어요.",
  periodic_speech_insufficient: "높낮이나 발성 주기를 확인할 구간이 부족해요.",
  deferred: "연습 종료 후 참고값을 계산해요.",
})[reason] || "측정 자료를 확인하지 못했어요. 이 항목은 감점하지 않아요.";
