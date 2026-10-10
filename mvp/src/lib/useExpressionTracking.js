import {useEffect, useState} from "react";
import {resolveModel, resolveWasmUrl} from "./visionAssets.js";
import {addExpressionSample, faceCrop, normalizeFace} from "./expressionModel.js";

// Face crops stay in this browser. Only aggregated model outputs leave it.
export function useExpressionTracking(mediaStream, videoRef, turnAccRef) {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    if (!mediaStream?.getVideoTracks?.().some(t => t.readyState === "live")) { setStatus("idle"); return; }
    let cancelled = false, timer, face, session, busy = false;
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
        ort.env.wasm.proxy = true;
        ort.env.wasm.wasmPaths = {wasm: "/onnxruntime/ort-wasm-simd-threaded.wasm"};
        const [wasm, faceModel] = await Promise.all([resolveWasmUrl(), resolveModel("face")]);
        face = await vision.FaceLandmarker.createFromOptions(await vision.FilesetResolver.forVisionTasks(wasm), {
          baseOptions: {modelAssetPath: faceModel}, runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: false,
        });
        if (cancelled) { await dispose(); return; }
        session = await ort.InferenceSession.create("/models/expression_resnet18_v1/model.onnx", {executionProviders: ["wasm"]});
        if (cancelled) { await dispose(); return; }
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 224;
        const ctx = canvas.getContext("2d", {willReadFrequently: true});
        setStatus("ready");
        timer = window.setInterval(() => {
          if (busy || cancelled || videoRef.current?.readyState < 2 || !videoRef.current) return;
          busy = true;
          const acc = turnAccRef.current;
          pending = (async () => {
            try {
              const video = videoRef.current;
              const result = face.detectForVideo(video, performance.now());
              if (result.faceLandmarks.length !== 1) { if (!cancelled) setStatus("no_face"); return; }
              const crop = faceCrop(result.faceLandmarks[0], video.videoWidth, video.videoHeight);
              if (!crop) { if (!cancelled) setStatus("no_face"); return; }
              ctx.drawImage(video, crop.x, crop.y, crop.size, crop.size, 0, 0, 224, 224);
              const input = new ort.Tensor("float32", normalizeFace(ctx.getImageData(0, 0, 224, 224).data), [1, 3, 224, 224]);
              const output = await session.run({face: input});
              if (!cancelled && acc === turnAccRef.current) {
                addExpressionSample(acc, output.logits.data);
                setStatus("ready");
              }
            } catch { if (!cancelled) { setStatus("failed"); window.clearInterval(timer); } }
            finally { busy = false; }
          })();
        }, 1000);
      } catch {
        await dispose();
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      Promise.allSettled([initialization, pending]).then(dispose).catch(() => {});
    };
  }, [mediaStream, videoRef, turnAccRef]);
  return status;
}
