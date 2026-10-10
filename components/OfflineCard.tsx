"use client";
import { AlertTriangle, CheckCircle2, CloudOff, DownloadCloud, ShieldQuestion } from "lucide-react";
import { useOffline } from "@/lib/hooks";
import type { OfflineStatus } from "@/lib/offline";
import { btnPrimary, btnSecondary, Spinner } from "./ui";

const LABEL: Record<OfflineStatus, string> = {
  NOT_READY: "Not ready",
  DOWNLOADING: "Working…",
  READY_UNVERIFIED: "Saved, not yet verified",
  OFFLINE_READY: "Offline ready",
  ERROR: "Problem",
};

const check = (ok: boolean, label: string) => (
  <li className="flex items-center gap-2">
    {ok ? <CheckCircle2 size={16} className="text-forest" aria-hidden /> : <CloudOff size={16} className="text-muted" aria-hidden />}
    <span>{label}</span>
    <span className="sr-only">{ok ? "saved" : "not saved"}</span>
  </li>
);

export default function OfflineCard() {
  const { state, checked, setup } = useOffline();
  const busy = state.status === "DOWNLOADING";
  const Icon = state.status === "OFFLINE_READY" ? CheckCircle2 : state.status === "ERROR" ? AlertTriangle : state.status === "READY_UNVERIFIED" ? ShieldQuestion : CloudOff;
  return (
    <section aria-label="Offline status" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${state.status === "OFFLINE_READY" ? "bg-lime text-forest-deep" : "bg-cream text-muted"}`}>
          {busy ? <Spinner /> : <Icon size={20} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="font-bold" data-testid="offline-status" data-status={checked ? state.status : "CHECKING"}>{checked ? LABEL[state.status] : "Checking…"}</p>
          <p className="text-sm text-muted">{state.message}</p>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted">
        {check(state.checks.swControlling, "App worker")}
        {check(state.checks.shellCached, "App pages")}
        {check(state.checks.runtimeCached, "AI runtime")}
        {check(state.checks.modelCached, "AI model")}
      </ul>
      {state.status !== "OFFLINE_READY" && (
        <button onClick={() => void setup()} disabled={busy || !checked} className={`${state.status === "READY_UNVERIFIED" ? btnPrimary : btnSecondary} mt-4`}>
          <DownloadCloud size={20} aria-hidden />
          {state.status === "READY_UNVERIFIED" ? "Run offline check" : state.status === "ERROR" ? "Try again" : "Download for offline use"}
        </button>
      )}
      {state.status === "OFFLINE_READY" && (
        <button onClick={() => void setup()} disabled={busy} className={`${btnSecondary} mt-4`}>Re-run offline check</button>
      )}
      <p className="mt-3 text-xs text-muted">
        “Offline ready” appears only after a real test: the AI loads from this device with the network blocked and analyzes a test image. Your browser can still clear saved files under storage pressure.
      </p>
    </section>
  );
}
