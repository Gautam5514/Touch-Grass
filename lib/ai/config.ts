import type { VerifyParams } from "../types";

export const MODEL_ID = "Xenova/clip-vit-base-patch32";
/**
 * Pinned Hugging Face commit used by scripts/fetch-model.mjs to fetch deterministic weights into
 * public/models/ at build time. Not passed to the pipeline() call itself: local-model loading
 * (see classifier.worker.ts) reads flat files with no revision segment in the path.
 */
export const MODEL_REVISION = "d15189d7028b43f1d3e65039190477f6af591c2a";
export const MODEL_DTYPE = "q8";
/** Stored with every result and used to invalidate the offline verification when it changes. */
export const MODEL_VERSION = `${MODEL_REVISION.slice(0, 8)}-${MODEL_DTYPE}`;
/** Real measured total for the files below: 154 MB (onnx/model_quantized.onnx) + ~3.6 MB of tokenizer/config files. */
export const MODEL_APPROX_MB = 158;

/** ONNX Runtime WASM is self-hosted so inference never depends on a CDN. */
export const ORT_FILES = ["/ort/ort-wasm-simd-threaded.mjs", "/ort/ort-wasm-simd-threaded.wasm"];

/**
 * Where scripts/fetch-model.mjs places the self-hosted CLIP weights (served from this app's own
 * origin at build time) so the browser never fetches the model from huggingface.co at runtime.
 */
export const MODEL_LOCAL_PATH = "/models/";

export const INFERENCE_TIMEOUT_MS = 60_000;
export const MAX_AI_DIMENSION = 448;

/**
 * Starting parameters. See docs/EVALUATION.md for how they were checked against the local
 * evaluation set. They are relative-score thresholds, not probabilities.
 */
export const DEFAULT_VERIFY_PARAMS: VerifyParams = {
  minScore: 0.45,
  minMargin: 0.15,
  mismatchScore: 0.5,
};

/** Per-mission overrides, filled in only where the evaluation shows a need. */
export const MISSION_VERIFY_OVERRIDES: Record<string, Partial<VerifyParams>> = {};
