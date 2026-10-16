import {useEffect, useState} from "react";
import {addExpressionSample, faceCrop, normalizeFace} from "./expressionModel.js";

// Face crops stay in this browser. Only aggregated model outputs leave it.
export function useExpressionTracking(mediaStream, videoRef, turnAccRef, faceLandmarksRef, participantRef, presenceEpochRef) {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    if (!mediaStream?.getVideoTracks?.().some(t => t.readyState === "live")) { setStatus("idle"); return; }
    let cancelled = false, timer, session, busy = false;
    let lastVideoTime = -1;
    let debugPanel, debugCanvas, debugLabel;
    const debug = new URLSearchParams(location.search).get("expressionDebug") === "1";
    const showInput = (message, source) => {
      if (!debug) return;
      if (!debugPanel) {
        debugPanel = document.createElement("aside");
        debugPanel.setAttribute("aria-label", "표정 모델 입력 확인");
        debugPanel.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:10000;padding:12px;background:#111;color:white;border:1px solid #888;border-radius:12px;width:248px;font:14px/1.5 sans-serif";
        debugCanvas = document.createElement("canvas");
        debugCanvas.width = debugCanvas.height = 224;
        debugLabel = document.createElement("div");
        debugPanel.append(debugCanvas, debugLabel);document.body.append(debugPanel);
      }
      debugLabel.textContent = message;
      const context = debugCanvas.getContext("2d");
      context.clearRect(0, 0, 224, 224);
      if (source) context.drawImage(source, 0, 0);
    };
    let pending = Promise.resolve();
    const dispose = async () => {
      const model = session;
      session = undefined;
      await model?.release();
    };
    setStatus("loading");
    showInput("얼굴 모델 준비 중");
    const initialization = (async () => {
      try {
        const ort = await import("onnxruntime-web/wasm");
        ort.env.wasm.numThreads = 1;
        // Vite rewrites the proxy worker module URL; run the single-thread WASM locally.
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = {wasm: "/onnxruntime/ort-wasm-simd-threaded.wasm"};
        if (cancelled) return;
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
              if (video.currentTime === lastVideoTime) return;
              lastVideoTime = video.currentTime;
              const participant = participantRef?.current.current;
              const generation = participantRef?.current.generation;
              const presenceEpoch = presenceEpochRef?.current;
              const points = participant ? faceLandmarksRef?.current : null;
              if (!points) { showInput(participant ? "시연자 얼굴 검출 대기" : "시연자 몸 추적 대기 — 중앙에서 어깨까지 보이게 서 주세요"); if (acc.expression) acc.expression.smileSince = null; if (!cancelled) setStatus("no_face"); return; }
              const crop = faceCrop(points, video.videoWidth, video.videoHeight);
              if (!crop) { showInput("얼굴이 너무 작거나 화면에서 잘려 분석 보류"); if (acc.expression) acc.expression.smileSince = null; if (!cancelled) setStatus("no_face"); return; }
              ctx.drawImage(video, crop.x, crop.y, crop.size, crop.size, 0, 0, 224, 224);
              showInput(`실제 모델 입력 224×224 · 얼굴 영역 ${Math.round(crop.size)}px`, canvas);
              const input = new ort.Tensor("float32", normalizeFace(ctx.getImageData(0, 0, 224, 224).data), [1, 3, 224, 224]);
              const output = await session.run({face: input});
              if (!cancelled && acc === turnAccRef.current && participantRef?.current.current
                  && generation === participantRef.current.generation && presenceEpoch === presenceEpochRef?.current) {
                addExpressionSample(acc, output.logits.data);
                setStatus("ready");
              }
            } catch (error) { console.warn("[expression-tracking] frame inference failed", error); if (acc.expression) acc.expression.smileSince = null; if (!cancelled) { setStatus("retrying"); } }
            finally { busy = false; }
          })();
        }, 1000);
      } catch (error) {
        console.warn("[expression-tracking] initialization failed", error);
        await dispose();
        showInput("얼굴 또는 표정 모델 로딩 실패");
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      debugPanel?.remove();
      Promise.allSettled([initialization, pending]).then(dispose).catch(() => {});
    };
  }, [mediaStream, videoRef, turnAccRef, faceLandmarksRef, participantRef, presenceEpochRef]);
  return status;
}
