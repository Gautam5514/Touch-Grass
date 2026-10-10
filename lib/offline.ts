import { ai, isModelCached, runOfflineSelfTest } from "./ai/classifier";
import { MODEL_APPROX_MB, MODEL_VERSION, ORT_FILES } from "./ai/config";
import { getSettings, updateSettings } from "./db";

export type OfflineStatus = "NOT_READY" | "DOWNLOADING" | "READY_UNVERIFIED" | "OFFLINE_READY" | "ERROR";

export interface OfflineChecks {
  swControlling: boolean;
  shellCached: boolean;
  runtimeCached: boolean;
  modelCached: boolean;
}

export interface OfflineState {
  status: OfflineStatus;
  message: string;
  checks: OfflineChecks;
}

export const SHELL_PAGES = ["/", "/explore/", "/adventure/", "/journal/", "/settings/", "/about/", "/privacy/"];

interface DeriveInput {
  checks: OfflineChecks;
  storedOfflineReady: boolean;
  storedModelVersion: string;
  currentModelVersion: string;
  busy: "downloading" | "verifying" | null;
  error: string | null;
}

/**
 * Pure status rules. OFFLINE_READY needs *both* a past passing self-test for this exact model
 * version *and* every asset still being present right now (storage can be evicted).
 */
export function deriveOfflineStatus(i: DeriveInput): Pick<OfflineState, "status" | "message"> {
  const { swControlling, shellCached, runtimeCached, modelCached } = i.checks;
  if (i.error) return { status: "ERROR", message: i.error };
  if (i.busy === "downloading") return { status: "DOWNLOADING", message: "Downloading the AI and app files…" };
  if (i.busy === "verifying") return { status: "DOWNLOADING", message: "Testing the AI with the network blocked…" };
  const allPresent = swControlling && shellCached && runtimeCached && modelCached;
  if (!allPresent) {
    const missing = [!swControlling && "app worker", !shellCached && "app pages", !runtimeCached && "AI runtime", !modelCached && "AI model"].filter(Boolean).join(", ");
    return {
      status: "NOT_READY",
      message: i.storedOfflineReady ? `Saved files were cleared by the browser (${missing}). Download again to use offline.` : `Not saved yet: ${missing}.`,
    };
  }
  if (i.storedOfflineReady && i.storedModelVersion === i.currentModelVersion) {
    return { status: "OFFLINE_READY", message: "Verified: the AI ran from this device with the network blocked." };
  }
  return { status: "READY_UNVERIFIED", message: i.storedOfflineReady ? "The AI model changed. Run the offline check again." : "Files are saved, but offline use hasn’t been tested yet." };
}

export async function readChecks(): Promise<OfflineChecks> {
  const swControlling = typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
  const has = async (urls: string[]) => {
    try {
      const hits = await Promise.all(urls.map((u) => caches.match(u, { ignoreSearch: true })));
      return hits.every(Boolean);
    } catch {
      return false;
    }
  };
  const [shellCached, runtimeCached, modelCached] = await Promise.all([has(SHELL_PAGES), has(ORT_FILES), isModelCached()]);
  return { swControlling, shellCached, runtimeCached, modelCached };
}

/** Asks the service worker to cache pages, the WASM runtime and every asset this page loaded, and waits for it. */
export async function cacheAppShell(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sw = reg?.active;
  if (!sw) throw new Error("The app worker isn’t active yet. Reload the page once and try again.");
  const loaded = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin));
  await new Promise<void>((resolve, reject) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => reject(new Error("Saving the app files timed out.")), 60_000);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      if (e.data?.ok) resolve();
      else reject(new Error(e.data?.error ?? "Couldn’t save the app files."));
    };
    sw.postMessage({ type: "CACHE_URLS", urls: [...new Set([...SHELL_PAGES, ...ORT_FILES, ...loaded])] }, [ch.port2]);
  });
}

export function friendlyStorageError(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === "QuotaExceededError") return `Not enough free storage on this device to save the AI (about ${MODEL_APPROX_MB} MB). Free some space and try again.`;
  return e instanceof Error ? e.message : "Something went wrong while saving files for offline use.";
}

/** Full offline setup: download everything, then prove it works with a real network-blocked inference. */
export async function setupOffline(onBusy: (b: "downloading" | "verifying") => void): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    onBusy("downloading");
    await navigator.storage?.persist?.().catch(() => false);
    await ai.prepare();
    await cacheAppShell();
    onBusy("verifying");
    const test = await runOfflineSelfTest();
    if (!test.ok) return { ok: false, error: `Offline check failed: ${test.reason}` };
    await updateSettings({ offlineReady: true, offlineVerifiedAt: Date.now(), modelVersion: MODEL_VERSION });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyStorageError(e) };
  }
}

/** Re-checks assets; if the browser evicted them, clears the stored "verified" flag so we never overclaim. */
export async function refreshOffline(busy: DeriveInput["busy"] = null, error: string | null = null): Promise<OfflineState> {
  const [checks, settings] = await Promise.all([readChecks(), getSettings().catch(() => null)]);
  const stored = !!settings?.offlineReady;
  const state = deriveOfflineStatus({
    checks,
    storedOfflineReady: stored,
    storedModelVersion: settings?.modelVersion ?? "",
    currentModelVersion: MODEL_VERSION,
    busy,
    error,
  });
  if (stored && state.status === "NOT_READY") await updateSettings({ offlineReady: false }).catch(() => {});
  return { ...state, checks };
}
