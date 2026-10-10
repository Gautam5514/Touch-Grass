"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock } from "lucide-react";
import { ADVENTURE_MODES, generateMissions } from "@/lib/missions";
import { discardAdventure, startSession, StorageError, toStorageError } from "@/lib/db";
import { ai, isLowMemoryDevice } from "@/lib/ai/classifier";
import { useActiveAdventure } from "@/lib/hooks";
import type { AdventureModeId } from "@/lib/types";
import AiStatus from "@/components/AiStatus";
import ConfirmDialog from "@/components/ConfirmDialog";
import { btnPrimary, Card, cardHover, Eyebrow, Spinner } from "@/components/ui";

export default function Explore() {
  const router = useRouter();
  const active = useActiveAdventure();
  const [mode, setMode] = useState<AdventureModeId>("explorer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);

  async function begin() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    // The AI has been loading in the background since the app opened (see AiPrefetch) and starting
    // an adventure never waits on it. If a photo gets analyzed before it's ready, MissionPanel shows
    // loading progress right there, with retry and manual-logging fallback if it fails.
    ai.prepare().catch(() => undefined);
    try {
      if (active?.id) await discardAdventure(active.id);
      const id = await startSession(mode, generateMissions(mode));
      router.push(`/adventure/${id}/`);
    } catch (e) {
      setError(e instanceof StorageError ? e.message : toStorageError(e).message);
      setBusy(false);
    }
  }

  const start = () => (active ? setConfirm(true) : void begin());

  return (
    <main id="main" className="flex flex-1 flex-col gap-5">
      <header className="rise">
        <Eyebrow>Explore</Eyebrow>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Choose your adventure</h1>
        <p className="mt-1 text-muted">Durations are just a guide. Take as long as you like.</p>
      </header>

      {active && (
        <Card className="!border-forest/30 !bg-lime/40">
          <p className="font-bold">You have an adventure in progress.</p>
          <Link href={`/adventure/${active.id}/`} prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-forest underline underline-offset-4">Continue it instead</Link>
        </Card>
      )}

      <div role="radiogroup" aria-label="Adventure mode" className="grid gap-3 md:grid-cols-3">
        {ADVENTURE_MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m.id)}
              disabled={busy}
              data-testid={`mode-${m.id}`}
              className={`${cardHover} flex min-h-24 items-center gap-4 rounded-2xl border-2 p-4 text-left transition md:flex-col md:items-start ${on ? "border-forest bg-lime/40" : "border-line bg-card"}`}
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-xl font-extrabold ${on ? "bg-forest text-white" : "bg-cream text-forest"}`}>{m.missionCount}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold leading-tight">{m.title}</span>
                <span className="block text-sm text-muted">{m.tagline}</span>
                <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-forest"><Clock size={14} aria-hidden /> {m.minutes}</span>
              </span>
              {on && <Check size={22} className="text-forest md:hidden" aria-hidden />}
            </button>
          );
        })}
      </div>

      <section aria-labelledby="prep" className="flex flex-col gap-3">
        <h2 id="prep" className="text-lg font-bold">AI status</h2>
        <AiStatus />
        {isLowMemoryDevice() && <Card className="!bg-warn-bg text-sm text-warn">This device reports very little memory. The AI may be slow or fail. Manual logging is available if so.</Card>}
      </section>

      {error && <p role="alert" className="rounded-2xl bg-warn-bg p-4 text-warn">{error}</p>}

      <div className="mt-auto flex flex-col gap-2">
        <button onClick={start} disabled={busy} className={btnPrimary} data-testid="begin">
          {busy ? <><Spinner /> Starting…</> : "Start adventure"}
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Replace your current adventure?"
        body="Starting a new adventure discards the one in progress and its photos."
        confirmLabel="Discard and start new"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); void begin(); }}
      />
    </main>
  );
}
