"use client";
import { useEffect, useState } from "react";
import { checkStorage, type StorageError } from "@/lib/db";
import { btnPrimary } from "./ui";

/** Blocks the app with a clear message if IndexedDB can't be opened (e.g. some private modes). */
export default function StorageGate({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<StorageError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    checkStorage().then((e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!error) return <>{children}</>;
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 text-center" role="alert">
      <p className="text-6xl" aria-hidden>🔒</p>
      <h1 className="text-3xl font-bold">Can’t save on this device</h1>
      <p className="text-muted">{error.message}</p>
      <p className="text-sm text-muted">WildQuest keeps adventures in your browser’s storage. Try a normal (non-private) window, or allow site storage in your browser settings.</p>
      <button onClick={() => setAttempt((n) => n + 1)} className={`${btnPrimary} max-w-xs`}>Try again</button>
    </main>
  );
}
