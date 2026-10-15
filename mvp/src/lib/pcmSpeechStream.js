// ElevenLabs pcm_24000: mono, signed 16-bit little-endian. No full-file buffering.
export async function playPcmSpeechStream(response, { signal, onStart, onProgress, textLength }) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext || !response.body) throw new Error("Streaming audio unavailable");
  const context = new AudioContext();
  const reader = response.body.getReader();
  const nodes = new Set();
  let pending = new Uint8Array(0);
  let nextTime = 0;
  let firstTime = null;
  let receivedAll = false;
  let index = 0;
  let resolveEnded, rejectEnded;
  const ended = new Promise((resolve, reject) => { resolveEnded = resolve; rejectEnded = reject; });
  // Abort may occur before we reach the final await.
  ended.catch(() => {});
  const abort = () => {
    for (const node of nodes) { node.onended = null; node.stop(); }
    nodes.clear();
    void reader.cancel().catch(() => {});
    void context.close().catch(() => {});
    rejectEnded(new DOMException("Cancelled", "AbortError"));
  };
  signal.addEventListener("abort", abort, { once: true });
  const timer = window.setInterval(() => {
    if (firstTime === null || signal.aborted) return;
    const seconds = Math.max(0, context.currentTime - firstTime);
    const estimate = receivedAll ? seconds / Math.max(.001, nextTime - firstTime) * textLength : seconds * 7;
    index = Math.max(index, Math.min(textLength - 1, Math.floor(estimate)));
    onProgress(index);
  }, 80);
  const readChunk = async () => {
    let timeout;
    try {
      return await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timeout = window.setTimeout(() => reject(new Error("Speech stream stalled")), 10_000);
        }),
      ]);
    } finally { window.clearTimeout(timeout); }
  };
  try {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    await context.resume();
    while (true) {
      const { value, done } = await readChunk();
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (done) break;
      const bytes = new Uint8Array(pending.length + value.length);
      bytes.set(pending); bytes.set(value, pending.length);
      const length = bytes.length - bytes.length % 2;
      pending = bytes.slice(length);
      if (!length) continue;
      const buffer = context.createBuffer(1, length / 2, 24000);
      const samples = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      const start = Math.max(context.currentTime + .02, nextTime);
      nodes.add(node);
      node.onended = () => { nodes.delete(node); if (receivedAll && !nodes.size) resolveEnded(); };
      node.start(start);
      nextTime = start + buffer.duration;
      if (firstTime === null) { firstTime = start; onStart(); }
    }
    if (pending.length || firstTime === null) throw new Error("Incomplete PCM stream");
    receivedAll = true;
    if (!nodes.size) resolveEnded();
    await ended;
  } finally {
    window.clearInterval(timer);
    signal.removeEventListener("abort", abort);
    for (const node of nodes) { node.onended = null; node.stop(); }
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    if (context.state !== "closed") await context.close();
  }
}
