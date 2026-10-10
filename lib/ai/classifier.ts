import { INFERENCE_TIMEOUT_MS, MODEL_APPROX_MB, MODEL_ID, MODEL_VERSION } from "./config";
import type { RankedLabel } from "../types";
import type { WorkerIn, WorkerOut } from "./classifier.worker";

export type AiStatus = "idle" | "loading" | "ready" | "inferencing" | "error";
export type AiErrorCode =
  | "unsupported"
  | "offline-no-cache"
  | "download-failed"
  | "init-failed"
  | "oom"
  | "timeout"
  | "inference-failed"
  | "aborted";

export class AiError extends Error {
  constructor(readonly code: AiErrorCode, message: string, readonly detail?: string) {
    super(message);
    this.name = "AiError";
  }
}

/** Plain-language message and the best next step for each failure. */
export const AI_ERROR_HELP: Record<AiErrorCode, { message: string; hint: string }> = {
  unsupported: { message: "This browser can’t run the on-device AI.", hint: "Try a recent Chrome, Edge, Safari or Firefox. You can still log discoveries manually." },
  "offline-no-cache": { message: "You’re offline and the AI model isn’t saved on this device yet.", hint: `Connect once to download it (about ${MODEL_APPROX_MB} MB), or log discoveries manually.` },
  "download-failed": { message: "The AI model couldn’t be downloaded.", hint: "Check your connection and retry. You can log manually in the meantime." },
  "init-failed": { message: "The AI model couldn’t start on this device.", hint: "Retry, or close other tabs to free memory. Manual logging still works." },
  oom: { message: "This device ran out of memory running the AI.", hint: "Close other apps and tabs, then retry. If it keeps happening, use manual logging." },
  timeout: { message: "The AI took too long and was stopped.", hint: "Retry with a smaller or clearer photo, or log manually." },
  "inference-failed": { message: "The AI hit an error while looking at this photo.", hint: "Try again or take another photo." },
  aborted: { message: "Analysis cancelled.", hint: "" },
};

export interface AiSnapshot {
  status: AiStatus;
  /** 0–1, only meaningful while `progressKnown`. We never invent a percentage. */
  progress: number;
  progressKnown: boolean;
  error: AiError | null;
}

type Pending = { resolve: (v: { scores: RankedLabel[]; ms: number }) => void; reject: (e: AiError) => void; timer: ReturnType<typeof setTimeout> };

/**
 * E2E-only seam. It is inert unless the app was built with NEXT_PUBLIC_E2E=1; production builds
 * ignore window.__WQ_MOCK_AI__ (asserted in tests/e2e/real.spec.ts).
 */
export interface MockAi {
  prepare?: () => Promise<void>;
  classify: (labels: string[]) => Promise<{ scores: RankedLabel[]; ms?: number }> | { scores: RankedLabel[]; ms?: number };
}
const mock = (): MockAi | undefined =>
  process.env.NEXT_PUBLIC_E2E === "1" && typeof window !== "undefined" ? (window as unknown as { __WQ_MOCK_AI__?: MockAi }).__WQ_MOCK_AI__ : undefined;

/** Features the on-device pipeline needs. Empty means supported. */
export function missingFeatures(): string[] {
  if (typeof window === "undefined") return [];
  const missing: string[] = [];
  if (typeof Worker === "undefined") missing.push("Web Workers");
  if (typeof WebAssembly === "undefined") missing.push("WebAssembly");
  if (typeof createImageBitmap === "undefined") missing.push("image decoding");
  if (typeof indexedDB === "undefined") missing.push("local storage");
  return missing;
}

export const isLowMemoryDevice = () => typeof navigator !== "undefined" && ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 1;

class AiEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private chain: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private snap: AiSnapshot = { status: "idle", progress: 0, progressKnown: false, error: null };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<AiSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((f) => f());
  }

  private spawn() {
    const w = new Worker(new URL("./classifier.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerOut>) => this.onMessage(e.data);
    w.onerror = (e) => this.crash(new AiError("init-failed", "The AI worker stopped unexpectedly.", e.message));
    w.onmessageerror = () => this.crash(new AiError("inference-failed", "The AI worker sent an unreadable message."));
    this.worker = w;
    return w;
  }

  private onMessage(m: WorkerOut) {
    if (m.type === "progress") {
      this.set({ progress: m.total ? m.loaded / m.total : 0, progressKnown: m.known && m.total > 0 });
    } else if (m.type === "result") {
      const p = this.pending.get(m.id);
      if (!p) return; // stale: the request was cancelled or timed out
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      p.resolve({ scores: m.scores, ms: m.ms });
    } else if (m.type === "error" && m.id !== undefined) {
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      p.reject(new AiError(m.code === "oom" ? "oom" : "inference-failed", AI_ERROR_HELP[m.code === "oom" ? "oom" : "inference-failed"].message, m.message));
    }
  }

  /** Terminates the worker and fails everything in flight; a later call starts fresh. */
  private crash(err: AiError) {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
    this.set({ status: "error", error: err });
  }

  /** Loads the model once per worker lifecycle. Safe to call repeatedly. */
  prepare(): Promise<void> {
    const m = mock();
    if (m) {
      this.set({ status: "loading", error: null });
      return (m.prepare?.() ?? Promise.resolve()).then(() => this.set({ status: "ready", progress: 1, progressKnown: true }));
    }
    if (this.ready) return this.ready;
    const missing = missingFeatures();
    if (missing.length) {
      const err = new AiError("unsupported", AI_ERROR_HELP.unsupported.message, `Missing: ${missing.join(", ")}`);
      this.set({ status: "error", error: err });
      return Promise.reject(err);
    }
    this.set({ status: "loading", progress: 0, progressKnown: false, error: null });
    this.ready = (async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false && !(await isModelCached())) {
        throw new AiError("offline-no-cache", AI_ERROR_HELP["offline-no-cache"].message);
      }
      const w = this.worker ?? this.spawn();
      await new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent<WorkerOut>) => {
          if (e.data.type === "ready") {
            w.removeEventListener("message", handler);
            resolve();
          } else if (e.data.type === "error" && e.data.id === undefined) {
            w.removeEventListener("message", handler);
            const code = e.data.code === "download-failed" || e.data.code === "oom" ? e.data.code : "init-failed";
            reject(new AiError(code, AI_ERROR_HELP[code].message, e.data.message));
          }
        };
        w.addEventListener("message", handler);
        w.postMessage({ type: "init" } satisfies WorkerIn);
      });
      this.set({ status: "ready", progress: 1, progressKnown: true, error: null });
    })().catch((e: unknown) => {
      const err = e instanceof AiError ? e : new AiError("init-failed", AI_ERROR_HELP["init-failed"].message, String(e));
      this.worker?.terminate();
      this.worker = null;
      this.ready = null;
      this.set({ status: "error", error: err });
      throw err;
    });
    return this.ready;
  }

  /**
   * Classifies one image. Requests run one at a time. If `signal` aborts (e.g. the user left the
   * page) the caller gets an `aborted` error and any late worker response is dropped as stale.
   */
  classify(image: { data: Uint8ClampedArray; width: number; height: number }, labels: string[], signal?: AbortSignal) {
    const run = async () => {
      if (signal?.aborted) throw new AiError("aborted", AI_ERROR_HELP.aborted.message);
      const m = mock();
      if (m) {
        this.set({ status: "inferencing" });
        try {
          const r = await m.classify(labels);
          return { scores: r.scores, ms: r.ms ?? 1 };
        } catch (e) {
          throw new AiError("inference-failed", AI_ERROR_HELP["inference-failed"].message, String(e));
        } finally {
          this.set({ status: "ready" });
        }
      }
      await this.prepare();
      if (signal?.aborted) throw new AiError("aborted", AI_ERROR_HELP.aborted.message);
      const id = this.nextId++;
      this.set({ status: "inferencing" });
      try {
        return await new Promise<{ scores: RankedLabel[]; ms: number }>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(id);
            // A stuck inference can't be cancelled in the worker, so replace it.
            this.crash(new AiError("timeout", AI_ERROR_HELP.timeout.message));
            reject(new AiError("timeout", AI_ERROR_HELP.timeout.message));
          }, INFERENCE_TIMEOUT_MS);
          this.pending.set(id, { resolve, reject, timer });
          signal?.addEventListener(
            "abort",
            () => {
              const p = this.pending.get(id);
              if (!p) return;
              clearTimeout(p.timer);
              this.pending.delete(id);
              reject(new AiError("aborted", AI_ERROR_HELP.aborted.message));
            },
            { once: true },
          );
          this.worker!.postMessage({ type: "classify", id, rgb: image.data, width: image.width, height: image.height, labels } satisfies WorkerIn);
        });
      } finally {
        if (this.snap.status === "inferencing") this.set({ status: "ready" });
      }
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  retry() {
    if (this.snap.status === "error") this.set({ status: "idle", error: null });
    return this.prepare();
  }
}

export const ai = new AiEngine();

/**
 * Offline self-test: a fresh worker loads the model with cross-origin network blocked, then runs
 * a real inference. Passing proves the weights load from the device cache and inference works.
 */
export async function runOfflineSelfTest(): Promise<{ ok: true; ms: number } | { ok: false; reason: string }> {
  const m = mock();
  if (m) return { ok: true, ms: 1 };
  if (missingFeatures().length) return { ok: false, reason: "This browser can’t run the on-device AI." };
  const w = new Worker(new URL("./classifier.worker.ts", import.meta.url), { type: "module" });
  const done = (r: { ok: true; ms: number } | { ok: false; reason: string }) => {
    w.terminate();
    return r;
  };
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(done({ ok: false, reason: "The self-test timed out." })), INFERENCE_TIMEOUT_MS);
    const finish = (r: { ok: true; ms: number } | { ok: false; reason: string }) => {
      clearTimeout(timer);
      resolve(done(r));
    };
    w.onerror = (e) => finish({ ok: false, reason: e.message || "Worker error" });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const d = e.data;
      if (d.type === "ready") w.postMessage({ type: "selftest", id: 1 } satisfies WorkerIn);
      else if (d.type === "error") finish({ ok: false, reason: d.message });
      else if (d.type === "result") {
        const sum = d.scores.reduce((s, r) => s + r.score, 0);
        const valid = d.scores.length === 3 && d.scores.every((r) => Number.isFinite(r.score)) && Math.abs(sum - 1) < 0.01;
        finish(valid ? { ok: true, ms: d.ms } : { ok: false, reason: "The model returned unexpected output." });
      }
    };
    w.postMessage({ type: "init", blockNetwork: true } satisfies WorkerIn);
  });
}

/** True when the weights and tokenizer files for the pinned model revision are in the browser cache. */
export async function isModelCached(): Promise<boolean> {
  try {
    if (mock()) return true;
    if (typeof caches === "undefined") return false;
    const cache = await caches.open("transformers-cache");
    const urls = (await cache.keys()).map((r) => r.url);
    return ["model_quantized.onnx", "tokenizer.json", "preprocessor_config.json", "config.json"].every((n) => urls.some((u) => u.includes(MODEL_ID) && u.includes(n)));
  } catch {
    return false;
  }
}

export async function deleteModelCache() {
  try {
    await caches.delete("transformers-cache");
  } catch {
    /* nothing to delete */
  }
}

export const MODEL_INFO = { id: MODEL_ID, version: MODEL_VERSION, approxMb: MODEL_APPROX_MB };
