// Self-host the ONNX Runtime WASM so inference never depends on a CDN
// and the files can be cached for offline use.
import { copyFileSync, mkdirSync } from "node:fs";

const src = "node_modules/onnxruntime-web/dist";
const dest = "public/ort";
mkdirSync(dest, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  copyFileSync(`${src}/${f}`, `${dest}/${f}`);
}
console.log("Copied ONNX Runtime WASM to", dest);
