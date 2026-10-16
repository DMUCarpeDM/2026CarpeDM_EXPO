import { centralFace, drawCenteredInput, mapRegionLandmarks, TRACKING_SCAN_CENTERS } from "./centerPersonTracking.js";
import {useEffect, useState} from "react";
import {resolveModel, resolveWasmUrl} from "./visionAssets.js";
import {addExpressionSample, faceCrop, normalizeFace} from "./expressionModel.js";

const FACE_SAMPLE_MS = 200;
const EXPRESSION_SAMPLE_MS = 1000;
const STALE_FRAME_MS = 500;

// Face crops stay in this browser. Only aggregated model outputs leave it.
export function useExpressionTracking(mediaStream, videoRef, turnAccRef, faceLandmarksRef, lastPersonAtRef) {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    if (faceLandmarksRef) faceLandmarksRef.current = null;
    if (!mediaStream?.getVideoTracks?.().some(t => t.readyState === "live")) { setStatus("idle"); return; }
    let cancelled = false, timer, face, session, busy = false;
    let lastVideoTime = -1;
    let lastFrameAt = performance.now();
    let lastExpressionAt = -Infinity;
    let presenceEpoch = 0;
    let searchFrame = 0;
    let pending = Promise.resolve();
    const dispose = async () => {
      const detector = face, model = session;
      face = session = undefined;
      detector?.close();
      await model?.release();
    };
    setStatus("loading");
    const initialization = (async () => {
      try {
        const [vision, ort] = await Promise.all([import("@mediapipe/tasks-vision"), import("onnxruntime-web/wasm")]);
        ort.env.wasm.numThreads = 1;
        // Vite rewrites the proxy worker module URL; run the single-thread WASM locally.
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = {wasm: "/onnxruntime/ort-wasm-simd-threaded.wasm"};
        const [wasm, faceModel] = await Promise.all([resolveWasmUrl(), resolveModel("face")]);
        face = await vision.FaceLandmarker.createFromOptions(await vision.FilesetResolver.forVisionTasks(wasm), {
          baseOptions: {modelAssetPath: faceModel}, runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: false,
          minFaceDetectionConfidence: .4, minFacePresenceConfidence: .4, minTrackingConfidence: .4,
        });
        if (cancelled) { await dispose(); return; }
        session = await ort.InferenceSession.create("/models/expression_resnet18_v1/model.onnx", {executionProviders: ["wasm"]});
        if (cancelled) { await dispose(); return; }
        const centerCanvas = document.createElement("canvas");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 224;
        const ctx = canvas.getContext("2d", {willReadFrequently: true});
        const loseFace = () => {
          presenceEpoch++;
          if (faceLandmarksRef) faceLandmarksRef.current = null;
          if (turnAccRef.current.expression) turnAccRef.current.expression.smileSince = null;
          setStatus("no_face");
        };
        setStatus("ready");
        timer = window.setInterval(() => {
          if (cancelled) return;
          const video = videoRef.current;
          const ts = performance.now();
          if (!video || video.readyState < 2) { loseFace(); return; }
          if (video.currentTime === lastVideoTime) {
            if (ts - lastFrameAt >= STALE_FRAME_MS) loseFace();
            return;
          }
          lastVideoTime = video.currentTime;
          lastFrameAt = ts;
          try {
            const result = face.detectForVideo(video, ts);
            let points = centralFace(result.faceLandmarks);
            if (!points && result.faceLandmarks.length === 0) {
              const region = drawCenteredInput(video, centerCanvas, TRACKING_SCAN_CENTERS[searchFrame++ % TRACKING_SCAN_CENTERS.length]);
              const cropped = centralFace(face.detectForVideo(centerCanvas, ts + .001).faceLandmarks);
              if (cropped) points = mapRegionLandmarks(cropped, region, video.videoWidth, video.videoHeight);
            }
            if (points && lastPersonAtRef) lastPersonAtRef.current = ts;
            if (faceLandmarksRef) faceLandmarksRef.current = points ? { landmarks: points, at: ts } : null;
            if (!points) { loseFace(); return; }
            const crop = faceCrop(points, video.videoWidth, video.videoHeight);
            if (!crop) {
              presenceEpoch++;
              if (turnAccRef.current.expression) turnAccRef.current.expression.smileSince = null;
              setStatus("no_face");
              return;
            }
            // Landmark refresh and departure detection must continue while ONNX is running.
            if (busy || ts - lastExpressionAt < EXPRESSION_SAMPLE_MS) return;
            ctx.drawImage(video, crop.x, crop.y, crop.size, crop.size, 0, 0, 224, 224);
            const input = new ort.Tensor("float32", normalizeFace(ctx.getImageData(0, 0, 224, 224).data), [1, 3, 224, 224]);
            const acc = turnAccRef.current, epoch = presenceEpoch;
            busy = true;
            lastExpressionAt = ts;
            pending = (async () => {
              try {
                const output = await session.run({face: input});
                if (!cancelled && epoch === presenceEpoch && acc === turnAccRef.current) {
                  addExpressionSample(acc, output.logits.data);
                  setStatus("ready");
                }
              } catch (error) {
                console.warn("[expression-tracking] frame inference failed", error);
                if (!cancelled && epoch === presenceEpoch && acc === turnAccRef.current) {
                  if (acc.expression) acc.expression.smileSince = null;
                  setStatus("retrying");
                }
              } finally { busy = false; }
            })();
          } catch (error) {
            console.warn("[expression-tracking] landmark inference failed", error);
            loseFace();
            setStatus("retrying");
          }
        }, FACE_SAMPLE_MS);
      } catch (error) {
        console.warn("[expression-tracking] initialization failed", error);
        await dispose();
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      if (faceLandmarksRef) faceLandmarksRef.current = null;
      window.clearInterval(timer);
      Promise.allSettled([initialization, pending]).then(dispose).catch(() => {});
    };
  }, [mediaStream, videoRef, turnAccRef, faceLandmarksRef, lastPersonAtRef]);
  return status;
}
