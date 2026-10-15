import { createElement, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useMirrorVisitorIdle } from "../useMirrorVisitorIdle.js";
import { useFaceTracking } from "../useFaceTracking.js";

const control = window.visitor = { returns: 0, voice: 0, person: false, face: false, frozen: false, closed: 0 };
window.AudioContext = class {
  state = "running";
  async resume() {}
  async close() { control.closed++; }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() {
    return { getFloatTimeDomainData(samples) {
      samples.forEach((_, i) => { samples[i] = Math.sin(i) * control.voice; });
    } };
  }
};
window.MediaStream = class { constructor(tracks) { this.getAudioTracks = () => tracks; } };
const audio = { readyState: "live", enabled: true, muted: false };
const stream = { getVideoTracks: () => [{ readyState: "live" }], getAudioTracks: () => [audio] };

function Harness() {
  const [enabled, setEnabled] = useState(true);
  const pausedRef = useRef(false);
  const videoRef = useRef(null);
  if (!videoRef.current) {
    // 중앙 크롭도 실제 CanvasImageSource를 사용하도록 카메라 프레임을 대체한다.
    const frame = document.createElement("canvas");
    frame.width = 640; frame.height = 480;
    Object.defineProperties(frame, {
      readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 },
      currentTime: { get: () => control.frozen ? 0 : performance.now() / 1000 },
    });
    videoRef.current = frame;
  }
  const canvasRef = useRef(null);
  const track = useFaceTracking(stream, videoRef, canvasRef, true);
  const markActivity = useMirrorVisitorIdle({ enabled, mediaStream: stream, lastPersonAtRef: track.lastPersonAtRef, pausedRef,
    onIdle: () => { control.returns++; } });
  useEffect(() => {
    Object.assign(control, { ready: track.status === "ready", expression: track.expressionStatus, markActivity,
      pause: (value) => { pausedRef.current = value; markActivity(); }, disable: () => setEnabled(false), audio });
  });
  return createElement("output", null, "visitor idle harness");
}
const root = createRoot(document.getElementById("root"));
control.unmount = () => root.unmount();
root.render(createElement(Harness));
