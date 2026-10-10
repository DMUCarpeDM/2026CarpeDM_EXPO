import {mkdir, copyFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const root = new URL("../", import.meta.url);
const target = new URL("public/onnxruntime/", root);
await mkdir(target, {recursive: true});
for (const name of ["ort-wasm-simd-threaded.wasm"]) {
  await copyFile(fileURLToPath(new URL(`node_modules/onnxruntime-web/dist/${name}`, root)), fileURLToPath(new URL(name, target)));
}
