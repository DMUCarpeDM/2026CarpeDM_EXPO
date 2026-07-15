/** 오프라인 전시 대비 — MediaPipe wasm/모델을 public/에 내려받는다.
 * 비언어 측정(Eye/Posture)이 인터넷 없이 동작하려면 실행 필요:  npm run setup-offline
 * 자산은 gitignore(용량 20MB) 되므로 배포 PC에서 1회 실행한다. (런타임엔 없으면 CDN 폴백) */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const ASSETS = [
  { url: `${WASM}/vision_wasm_internal.js`, out: "public/mediapipe-wasm/vision_wasm_internal.js" },
  { url: `${WASM}/vision_wasm_internal.wasm`, out: "public/mediapipe-wasm/vision_wasm_internal.wasm" },
  { url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", out: "public/models/face_landmarker.task" },
  { url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", out: "public/models/pose_landmarker_lite.task" },
];

for (const { url, out } of ASSETS) {
  if (existsSync(out)) { console.log("skip (이미 있음):", out); continue; }
  await mkdir(dirname(out), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 ${url} → ${res.status}`);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log("저장:", out);
}
console.log("MediaPipe 오프라인 자산 준비 완료 (Eye/Posture 온디바이스 측정 가능)");
