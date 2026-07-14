/** 전시장 오프라인 대비 — MediaPipe wasm/모델을 public/에 준비한다.
 * 실행: npm run setup-offline  (인터넷이 되는 곳에서 미리 1회 실행)
 * 이후 앱은 로컬 자산을 우선 사용하고, 없으면 CDN으로 폴백한다.
 */
import { cpSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 1) wasm — npm 패키지에 동봉된 파일을 복사
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = join(root, 'public/mediapipe-wasm');
cpSync(wasmSrc, wasmDest, { recursive: true });
console.log('✓ wasm 복사 완료 →', wasmDest);

// 2) 모델 다운로드
const MODELS = [
  ['https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', 'face_landmarker.task'],
  ['https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', 'pose_landmarker_lite.task'],
];
const modelDir = join(root, 'public/models');
mkdirSync(modelDir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} ${url}`));
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

for (const [url, name] of MODELS) {
  const dest = join(modelDir, name);
  if (existsSync(dest)) {
    console.log('· 이미 있음:', name);
    continue;
  }
  await download(url, dest);
  console.log('✓ 다운로드 완료:', name);
}
console.log('\n오프라인 준비 끝 — 이제 인터넷 없이도 시선·자세 분석이 동작합니다.');
