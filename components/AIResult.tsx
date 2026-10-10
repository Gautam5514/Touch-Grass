import { CheckCircle2, HelpCircle, Info, ScanSearch } from "lucide-react";
import type { Mission, VerifyResult } from "@/lib/types";

const plain = (l: string) => l.replace(/^an? (close-up )?photo of (an? |the )?/, "");

const COPY = {
  matched: { title: "Likely match!", Icon: CheckCircle2, tone: "border-forest bg-lime/40", iconTone: "text-forest" },
  uncertain: { title: "Not sure yet", Icon: HelpCircle, tone: "border-warn/40 bg-warn-bg", iconTone: "text-warn" },
  mismatch: { title: "That looks like something else", Icon: ScanSearch, tone: "border-warn/40 bg-warn-bg", iconTone: "text-warn" },
  error: { title: "Couldn’t check this photo", Icon: Info, tone: "border-warn/40 bg-warn-bg", iconTone: "text-warn" },
} as const;

export default function AIResult({ result, mission, modelId, modelVersion, ms }: { result: VerifyResult; mission: Mission; modelId: string; modelVersion: string; ms: number }) {
  const c = COPY[result.outcome];
  const allowed = new Set([mission.targetLabel, ...mission.aliases]);
  return (
    <section aria-live="polite" data-testid="ai-result" data-outcome={result.outcome} className={`pop rounded-3xl border-2 p-5 ${c.tone}`}>
      <div className="flex items-center gap-3">
        <c.Icon className={c.iconTone} size={32} aria-hidden />
        <div>
          <h2 className="text-2xl font-bold leading-tight">{c.title}</h2>
          {result.topLabel && <p className="text-sm text-muted">Closest idea: <strong className="text-ink">{plain(result.topLabel)}</strong></p>}
        </div>
      </div>
      <p className="mt-3">{result.reason}</p>
      {result.outcome !== "matched" && result.outcome !== "error" && <p className="mt-2 text-sm text-muted">Try getting closer, steadying your phone or finding better light. Or log it yourself if you’re sure.</p>}

      {result.outcome !== "error" && (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[["Similarity", `${Math.round(result.targetScore * 100)}%`], ["Margin", `${Math.round(result.margin * 100)}%`], ["On-device", `${(ms / 1000).toFixed(1)}s`]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/70 py-2">
                <dd className="text-xl font-bold tabular-nums">{v}</dd>
                <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
              </div>
            ))}
          </dl>
          <details className="mt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-forest">How the model compared it</summary>
            <ul className="mt-1 space-y-2">
              {result.ranked.slice(0, 6).map((s) => (
                <li key={s.label} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className={allowed.has(s.label) ? "font-bold" : ""}>{plain(s.label)}{allowed.has(s.label) ? " (your target)" : ""}</span>
                    <span className="tabular-nums">{Math.round(s.score * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/70"><div className={`h-full rounded-full ${allowed.has(s.label) ? "bg-forest" : "bg-ink/30"}`} style={{ width: `${s.score * 100}%` }} /></div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              These are <strong>relative similarity</strong> scores across the descriptions we compare against. They are not the probability that the photo is correct, and the model can be wrong. Model: {modelId} ({modelVersion}).
            </p>
          </details>
        </>
      )}
    </section>
  );
}
