"use client";
import Link from "next/link";
import { useEffect } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 text-center" role="alert">
      <p className="text-6xl" aria-hidden>🥀</p>
      <h1 className="text-3xl font-bold">Something wilted</h1>
      <p className="text-muted">That screen hit an unexpected problem. Your saved adventures are safe on this device.</p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button onClick={() => retry()} className={btnPrimary}>Try again</button>
        <Link href="/" className={btnSecondary}>Back to home</Link>
      </div>
    </main>
  );
}
