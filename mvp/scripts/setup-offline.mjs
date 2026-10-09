/** 전시장 오프라인 대비 — MediaPipe wasm/모델을 public/에 준비한다.
 * 실행: npm run setup-offline  (인터넷이 되는 곳에서 미리 1회 실행)
 * 이후 앱은 로컬 자산을 우선 사용하고, 없으면 CDN으로 폴백한다.
 * poc/frontend/public에 이미 자산이 있으면(모노레포) 다운로드 없이 복사한다.
 */
import { cpSync, existsSync, mkdirSync, createWriteStream, renameSync, rmSync, statSync, readFileSync } from "node:fs";
import { get } from "node:https";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pocPublic = join(root, "../poc/frontend/public");

// 1) wasm — npm 패키지에 동봉된 파일을 복사
const wasmDest = join(root, "public/mediapipe-wasm");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
if (existsSync(wasmSrc)) {
  cpSync(wasmSrc, wasmDest, { recursive: true });
  console.log("✓ wasm 복사 완료 →", wasmDest);
} else if (existsSync(join(pocPublic, "mediapipe-wasm"))) {
  cpSync(join(pocPublic, "mediapipe-wasm"), wasmDest, { recursive: true });
  console.log("✓ wasm 복사 완료 (poc) →", wasmDest);
} else {
  console.warn("· wasm 소스 없음 — npm install 후 다시 실행하세요");
}

// 2) 모델 — poc에 있으면 복사, 없으면 다운로드
const MODELS = [
  ["https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", "face_landmarker.task"],
  ["https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task", "pose_landmarker_heavy.task"],
  ["https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", "hand_landmarker.task"],
];
const modelDir = join(root, "public/models");
mkdirSync(modelDir, { recursive: true });

async function download(url, dest) {
  const temporary = `${dest}.download`;
  let request;
  const deadline = setTimeout(() => request?.destroy(new Error("model download exceeded 180 seconds")), 180000);
  try {
    const response = await new Promise((resolve, reject) => {
      request = get(url, { timeout: 15000 }, resolve);
      request.on("timeout", () => request.destroy(new Error("model download stalled")));
      request.on("error", reject);
    });
    if (response.statusCode !== 200) {
      response.resume();
      throw new Error(`${response.statusCode} ${url}`);
    }
    await pipeline(response, createWriteStream(temporary));
    const expected = Number(response.headers["content-length"]);
    if ((expected && statSync(temporary).size !== expected) || !completeTask(temporary)) {
      throw new Error("model download was incomplete");
    }
    renameSync(temporary, dest);
  } finally {
    clearTimeout(deadline);
    rmSync(temporary, { force: true });
  }
}

// MediaPipe .task bundles contain a ZIP directory footer. An interrupted
// download must never satisfy the next run's "already present" check.
function completeTask(path) {
  return readFileSync(path).lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) >= 0;
}

for (const [url, name] of MODELS) {
  const dest = join(modelDir, name);
  if (existsSync(dest) && !completeTask(dest)) throw new Error(`불완전한 모델 파일을 별도로 옮긴 뒤 다시 준비하세요: ${name}`);
  if (existsSync(dest)) {
    console.log("· 이미 있음:", name);
    continue;
  }
  const pocModel = join(pocPublic, "models", name);
  if (existsSync(pocModel) && completeTask(pocModel)) {
    cpSync(pocModel, dest);
    console.log("✓ 복사 완료 (poc):", name);
    continue;
  }
  await download(url, dest);
  console.log("✓ 다운로드 완료:", name);
}
console.log("\n로컬 자산 준비 완료 — 브라우저 모델 로딩과 실제 장치 인수는 별도로 확인하세요.");
