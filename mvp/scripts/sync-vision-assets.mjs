/** MediaPipe wasm·모델을 poc에서 복사 — 시선·자세 측정의 오프라인 자산 (총 ~41MB).
 *
 * 원본은 poc/frontend/public에 커밋돼 있고, 저장소 중복(41MB×2)을 피하려고
 * mvp/public 사본은 gitignore + dev/build 직전 자동 동기화로 유지한다.
 * poc 체크아웃이 없는 환경에서는 건너뛴다 — 그 경우 훅이 CDN 폴백을 쓴다(온라인 필요).
 */
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../poc/frontend/public");
const target = resolve(here, "../public");

for (const dir of ["mediapipe-wasm", "models"]) {
  const from = resolve(source, dir);
  const to = resolve(target, dir);
  if (!existsSync(from)) {
    console.warn(`[vision-assets] ${from} 없음 — 건너뜀 (오프라인 측정은 poc 체크아웃 필요)`);
    continue;
  }
  if (existsSync(to)) continue; // 이미 동기화됨
  cpSync(from, to, { recursive: true });
  console.log(`[vision-assets] ${dir} 복사 완료`);
}
