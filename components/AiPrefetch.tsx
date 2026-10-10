"use client";
import { useEffect } from "react";
import { ai } from "@/lib/ai/classifier";

/**
 * Starts loading the on-device AI model the moment the app opens, in the background, so it's
 * often ready before the user ever reaches a mission — no separate "download" step to tap through.
 * Silent and safe to call from anywhere: ai.prepare() is idempotent, and MissionPanel already shows
 * a clear "Loading AI…" state with real progress if someone analyzes a photo before it finishes.
 * Failures surface there too, with retry and manual-logging fallback — nothing is swallowed.
 */
export default function AiPrefetch() {
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return; // respect the browser's data-saver setting; it still loads on demand later
    ai.prepare().catch(() => undefined);
  }, []);
  return null;
}
