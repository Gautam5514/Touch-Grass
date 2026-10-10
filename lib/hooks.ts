"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ai } from "./ai/classifier";
import { db, getSettings } from "./db";
import { refreshOffline, setupOffline, type OfflineState } from "./offline";
import { DEFAULT_SETTINGS } from "./db";

export function useAi() {
  const snap = useSyncExternalStore(ai.subscribe, ai.getSnapshot, ai.getSnapshot);
  return { ...snap, prepare: useCallback(() => ai.prepare().catch(() => undefined), []), retry: useCallback(() => ai.retry().catch(() => undefined), []) };
}

export function useSettings() {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
}

/** undefined while loading, null when there is no active adventure. */
export function useActiveAdventure() {
  return useLiveQuery(async () => (await db.adventures.where("status").equals("active").last()) ?? null, []);
}

const INITIAL: OfflineState = {
  status: "NOT_READY",
  message: "Checking…",
  checks: { swControlling: false, shellCached: false, runtimeCached: false, modelCached: false },
};

export function useOffline() {
  const [state, setState] = useState<OfflineState>(INITIAL);
  const [checked, setChecked] = useState(false);
  const running = useRef(false);

  const refresh = useCallback(async (busy: "downloading" | "verifying" | null = null, error: string | null = null) => {
    setState(await refreshOffline(busy, error));
    setChecked(true);
  }, []);

  useEffect(() => {
    // Initial read of external state (Cache Storage + IndexedDB).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const setup = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const r = await setupOffline((b) => void refresh(b));
      await refresh(null, r.ok ? null : r.error);
    } finally {
      running.current = false;
    }
  }, [refresh]);

  return { state, checked, setup, refresh };
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
