/// <reference lib="webworker" />
import { env, pipeline, RawImage } from "@huggingface/transformers";
import { MODEL_DTYPE, MODEL_ID, MODEL_LOCAL_PATH, ORT_FILES } from "./config";

export type WorkerIn =
  | { type: "init"; /** Self-test mode: any cross-origin fetch fails, so only cached files can load. */ blockNetwork?: boolean }
  | { type: "classify"; id: number; rgb: Uint8ClampedArray; width: number; height: number; labels: string[] }
  | { type: "selftest"; id: number };

export type WorkerOut =
  | { type: "progress"; loaded: number; total: number; known: boolean }
  | { type: "ready" }
  | { type: "error"; id?: number; code: "download-failed" | "init-failed" | "oom" | "inference-failed"; message: string }
  | { type: "result"; id: number; scores: { label: string; score: number }[]; ms: number };

const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

const origin = self.location.origin;
env.backends.onnx.wasm!.wasmPaths = { mjs: `${origin}${ORT_FILES[0]}`, wasm: `${origin}${ORT_FILES[1]}` };
env.backends.onnx.wasm!.numThreads = 1;
// Self-hosted only: the model is fetched from this app's own origin (scripts/fetch-model.mjs
// places it under public/models/ at build time), never from huggingface.co at runtime.
env.allowLocalModels = true;
env.localModelPath = `${origin}${MODEL_LOCAL_PATH}`;
env.allowRemoteModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let classifierPromise: Promise<any> | null = null;

/**
 * Transformers.js binds `fetch` at import time, so patching `self.fetch` would do nothing. Its own
 * `env.fetch` hook is the one it uses. Every model file is now same-origin (self-hosted), so the
 * old "block cross-origin only" check would just pass through to the live dev/prod server instead
 * of proving anything is cached — block every call unconditionally to prove loading works from the
 * Cache Storage entries alone, with no network reachable at all.
 */
function blockNetwork() {
  env.fetch = (() => Promise.reject(new TypeError("Network blocked for offline self-test"))) as typeof env.fetch;
}

function load() {
  if (!classifierPromise) {
    const files = new Map<string, { loaded: number; total: number }>();
    classifierPromise = pipeline("zero-shot-image-classification", MODEL_ID, {
      device: "wasm",
      dtype: MODEL_DTYPE,
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        // Only report what is measurable: bytes from files that announced a size.
        if (p.status === "progress" && p.file && p.total) {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          post({ type: "progress", loaded, total, known: true });
        }
      },
    }).catch((e) => {
      classifierPromise = null;
      throw e;
    });
  }
  return classifierPromise;
}

const classifyError = (e: unknown, phase: "init" | "inference"): { code: Extract<WorkerOut, { type: "error" }>["code"]; message: string } => {
  const message = e instanceof Error ? e.message : String(e);
  if (/out of memory|oom|memory access out of bounds|allocation failed|bad_alloc/i.test(message)) return { code: "oom", message };
  if (phase === "init" && /fetch|network|Failed to load|ERR_|Could not locate|404/i.test(message)) return { code: "download-failed", message };
  return { code: phase === "init" ? "init-failed" : "inference-failed", message };
};

/** A flat gradient image: enough to prove the model runs end to end without any asset. */
function syntheticImage() {
  const w = 224;
  const h = 224;
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      rgb[i] = 90 + (y / h) * 100;
      rgb[i + 1] = 150 + (y / h) * 80;
      rgb[i + 2] = 220;
    }
  return new RawImage(rgb, w, h, 3);
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      if (msg.blockNetwork) blockNetwork();
      try {
        await load();
      } catch (err) {
        post({ type: "error", ...classifyError(err, "init") });
        return;
      }
      post({ type: "ready" });
    } else if (msg.type === "classify" || msg.type === "selftest") {
      const classifier = await load();
      const labels = msg.type === "classify" ? msg.labels : ["a photo of the sky", "a photo of a building", "a photo of grass"];
      const image = msg.type === "classify" ? new RawImage(msg.rgb, msg.width, msg.height, 3) : syntheticImage();
      const t0 = performance.now();
      const out = await classifier(image, labels, { hypothesis_template: "{}" });
      post({
        type: "result",
        id: msg.id,
        scores: out.map((o: { label: string; score: number }) => ({ label: o.label, score: o.score })),
        ms: Math.round(performance.now() - t0),
      });
    }
  } catch (err) {
    post({ type: "error", id: "id" in msg ? msg.id : undefined, ...classifyError(err, "inference") });
  }
};
