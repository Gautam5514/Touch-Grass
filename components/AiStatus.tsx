"use client";
import { AlertTriangle, CheckCircle2, Cpu } from "lucide-react";
import { AI_ERROR_HELP, MODEL_INFO } from "@/lib/ai/classifier";
import { useAi } from "@/lib/hooks";
import { btnSecondary, Spinner } from "./ui";

/** Honest model status. The percentage only appears when the browser reported real byte counts. */
export default function AiStatus({ compact = false }: { compact?: boolean }) {
  const { status, progress, progressKnown, error, retry } = useAi();
  const pct = Math.round(progress * 100);
  return (
    <section aria-label="AI model status" aria-live="polite" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex gap-3">
        <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/60 text-forest"><Cpu size={20} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          {status === "loading" && (
            <>
              <p className="flex items-center gap-2 font-semibold"><Spinner className="text-forest" /> {progressKnown ? `Loading AI… ${pct}%` : "Loading AI…"}</p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="AI download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressKnown ? pct : undefined}>
                <div className={`h-full rounded-full bg-forest ${progressKnown ? "transition-[width]" : "w-1/3 animate-pulse"}`} style={progressKnown ? { width: `${pct}%` } : undefined} />
              </div>
              {!compact && <p className="mt-2 text-sm text-muted">First time only: about {MODEL_INFO.approxMb} MB. After this it runs on your device.</p>}
            </>
          )}
          {status === "error" && error && (
            <>
              <p className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle size={18} aria-hidden /> {AI_ERROR_HELP[error.code].message}</p>
              <p className="mt-1 text-sm text-muted">{AI_ERROR_HELP[error.code].hint}</p>
              {error.detail && <p className="mt-1 break-words text-xs text-muted">Detail: {error.detail}</p>}
              <button onClick={() => void retry()} className={`${btnSecondary} mt-3 !min-h-12 !w-auto`}>Retry</button>
            </>
          )}
          {(status === "ready" || status === "inferencing") && (
            <>
              <p className="flex items-center gap-2 font-semibold text-forest"><CheckCircle2 size={18} aria-hidden /> AI ready</p>
              {!compact && <p className="mt-1 text-sm text-muted">Photos are analyzed on this device and never uploaded.</p>}
            </>
          )}
          {status === "idle" && (
            <>
              <p className="font-semibold">AI not loaded yet</p>
              {!compact && <p className="mt-1 text-sm text-muted">It loads automatically in the background, or on your next action.</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
