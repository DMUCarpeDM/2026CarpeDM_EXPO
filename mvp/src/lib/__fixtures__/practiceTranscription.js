import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { usePracticeTranscription } from "../usePracticeTranscription.js";

const control = window.stt = { recognitions: [], recorders: [], submissions: [], notes: [], voiced: true, requests: [] };
class Recognition {
  constructor() { this.starts = 0; this.stops = 0; control.recognitions.push(this); }
  start() { this.starts++; this.onstart?.(); }
  stop() { this.stops++; this.onend?.(); }
  result(text, isFinal = true) {
    const result = [{ transcript: text }];
    result.isFinal = isFinal;
    this.onresult({ resultIndex: 0, results: [result] });
  }
}
window.SpeechRecognition = new URLSearchParams(location.search).has("unsupported") ? undefined : Recognition;
window.webkitSpeechRecognition = undefined;
window.MediaStream = class { constructor(tracks) { this.getAudioTracks = () => tracks; } };
window.MediaRecorder = class {
  static isTypeSupported() { return true; }
  constructor() { this.state = "inactive"; control.recorders.push(this); }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(2000)]) });
    this.onstop?.();
  }
};
window.AudioContext = class {
  async decodeAudioData() {
    const samples = new Float32Array(1000).fill(control.voiced ? 0.1 : 0);
    return { length: samples.length, numberOfChannels: 1, sampleRate: 16000, getChannelData: () => samples };
  }
  async close() {}
};
const stream = new MediaStream([{ readyState: "live" }]);
const transcribe = () => new Promise((resolve) => control.requests.push(resolve));
function Harness() {
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState({ turn: { id: 1 }, paused: false, busy: false, aiSpeaking: false });
  const speech = usePracticeTranscription({
    ...options, draft, setDraft, mediaStream: stream, entryOverlayOpen: false,
    aiHealth: { server_stt: !new URLSearchParams(location.search).has("unsupported") },
    onTranscribe: transcribe, pushFeed: (note) => control.notes.push(note),
    onAutoSubmit: () => control.submissions.push(draft),
  });
  useEffect(() => {
    control.current = { ...speech, draft };
    control.update = (patch) => setOptions((previous) => ({ ...previous, ...patch }));
    control.type = (text) => { speech.clearAutoSubmit(); setDraft(text); speech.setInterim(""); };
  });
  return createElement("output", null, draft);
}
const root = createRoot(document.getElementById("root"));
control.unmount = () => root.unmount();
root.render(createElement(Harness));
