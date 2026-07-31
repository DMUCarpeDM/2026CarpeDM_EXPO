/** MediaRecorder(webm/opus) 녹음을 16-bit PCM WAV로 재인코딩 (poc recorder.ts 이식).
 * 서버 Voice-Fit 분석이 soundfile로 읽으므로 진짜 WAV 컨테이너가 필요하다 —
 * webm 바이트를 .wav 이름으로 보내면 음성 분석이 실패한다. */

export async function blobToWav(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    // 모노 믹스다운
    const mono = new Float32Array(decoded.length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch += 1) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < decoded.length; i += 1) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return encodeWav(mono, decoded.sampleRate);
  } finally {
    void ctx.close();
  }
}

/** encodeWav 출력(16-bit PCM mono) 조각에 말소리가 있는지 — RMS·피크 이중 게이트.
 * 서버 폴백 STT가 무음 조각까지 Whisper에 보내면 지연 낭비에 환청 텍스트
 * (무음 → "감사합니다" 류)까지 생기므로 전송 전에 걸러낸다.
 * 둘 다 넘어야 통과: RMS만(지속 소음)·피크만(단발 클릭)으로는 말소리가 아니다. */
const SPEECH_RMS = 0.008;
const SPEECH_PEAK = 0.06;

export async function wavHasSpeech(wavBlob) {
  const view = new DataView(await wavBlob.arrayBuffer());
  const count = (view.byteLength - 44) >> 1;
  if (count <= 0) return false;
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < count; i += 1) {
    const s = view.getInt16(44 + i * 2, true) / 0x8000;
    sumSq += s * s;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
  }
  return Math.sqrt(sumSq / count) >= SPEECH_RMS && peak >= SPEECH_PEAK;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, s) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
