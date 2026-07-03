/** 마이크 녹음 → WAV 변환 업로드 (서버 Voice-Fit 분석용).
 * MediaRecorder(webm/opus) 결과를 브라우저에서 디코드해 16-bit PCM WAV로 재인코딩한다
 * — 서버에 ffmpeg 없이 soundfile로 바로 읽을 수 있게 하기 위함.
 */

export class AudioTurnRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  start(stream: MediaStream): void {
    this.chunks = [];
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;
    const audioStream = new MediaStream(audioTracks);
    this.recorder = new MediaRecorder(audioStream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  async stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return null;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    this.recorder = null;
    if (!this.chunks.length) return null;
    const webm = new Blob(this.chunks, { type: this.chunks[0].type });
    try {
      return await blobToWav(webm);
    } catch {
      return null; // 디코드 실패 시 오디오 없이 진행 (텍스트 기반 근사 분석)
    }
  }
}

async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    // 모노 믹스다운
    const mono = new Float32Array(decoded.length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < decoded.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return encodeWav(mono, decoded.sampleRate);
  } finally {
    void ctx.close();
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
