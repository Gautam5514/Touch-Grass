// Self-host the CLIP model weights so the browser only ever talks to this app's own origin,
// never huggingface.co, at runtime. Downloads once; safe to re-run (skips files already present).
// Set WQ_SKIP_MODEL_FETCH=1 to skip entirely (e.g. for contributors iterating on unrelated code
// with no internet, or CI that doesn't need a working AI pipeline).
//
// Keep MODEL_ID / MODEL_REVISION / the file list here in sync with lib/ai/config.ts and whichever
// dtype's ONNX file it requests (q8 -> model_quantized.onnx, fp16 -> model_fp16.onnx, etc.).
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const MODEL_ID = "Xenova/clip-vit-base-patch32";
const MODEL_REVISION = "d15189d7028b43f1d3e65039190477f6af591c2a";

const BASE = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}`;
const DEST = `public/models/${MODEL_ID}`;

// Every file the zero-shot-image-classification pipeline needs for dtype "q8".
const FILES = [
  "config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "merges.txt",
  "special_tokens_map.json",
  "onnx/model_quantized.onnx",
];

async function fetchFile(relPath) {
  const dest = `${DEST}/${relPath}`;
  // The revision is pinned, so file contents never change under us: any existing non-empty
  // file is already correct and we can skip re-downloading it.
  if (existsSync(dest) && statSync(dest).size > 0) return { relPath, skipped: true };

  mkdirSync(dirname(dest), { recursive: true });
  const url = `${BASE}/${relPath}`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return { relPath, skipped: false, bytes: statSync(dest).size };
}

async function main() {
  if (process.env.WQ_SKIP_MODEL_FETCH === "1") {
    console.log("WQ_SKIP_MODEL_FETCH=1: skipping self-hosted model fetch.");
    return;
  }
  console.log(`Fetching self-hosted model files for ${MODEL_ID}@${MODEL_REVISION.slice(0, 8)}...`);
  for (const f of FILES) {
    const r = await fetchFile(f);
    console.log(r.skipped ? `  skip  ${f} (already present)` : `  fetch ${f} (${(r.bytes / 1e6).toFixed(1)} MB)`);
  }
  console.log(`Self-hosted model files ready in ${DEST}`);
}

main().catch((err) => {
  console.error("Failed to fetch self-hosted model files:", err.message);
  console.error("Every user's browser would otherwise fail to load the AI model. Fix this before deploying.");
  process.exit(1);
});
