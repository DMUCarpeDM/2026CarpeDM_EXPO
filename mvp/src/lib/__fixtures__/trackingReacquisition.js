import { createElement, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useFaceTracking } from "../useFaceTracking.js";

const control = window.tracking = {
  person: true, face: true, center: .5, frozen: false, frameReady: true,
  poseError: false, faceError: false, holdExpression: true, pending: [],
  calls: { pose: 0, face: 0, expression: 0 },
};
const stream = { getVideoTracks: () => [{ readyState: "live" }] };

function Harness() {
  const videoRef = useRef(null), canvasRef = useRef(null);
  if (!videoRef.current) {
    const frame = document.createElement("canvas");
    frame.width = 640; frame.height = 480;
    Object.defineProperties(frame, {
      readyState: { get: () => control.frameReady ? 2 : 0 },
      videoWidth: { value: 640 }, videoHeight: { value: 480 },
      currentTime: { get: () => control.frozen ? 0 : performance.now() / 1000 },
    });
    videoRef.current = frame;
  }
  const track = useFaceTracking(stream, videoRef, canvasRef, true);
  useEffect(() => {
    control.live = { status: track.status, tracking: track.tracking, expression: track.expressionStatus };
    control.stats = track.peekTurnStats;
    control.pixels = () => {
      const canvas = canvasRef.current;
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0, sumX = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i]) { count++; sumX += ((i - 3) / 4) % canvas.width; }
      }
      return { count, center: count ? sumX / count / canvas.width : null };
    };
  });
  return createElement("canvas", { ref: canvasRef, style: { width: 640, height: 480 } });
}

const root = createRoot(document.getElementById("root"));
root.render(createElement(Harness));
