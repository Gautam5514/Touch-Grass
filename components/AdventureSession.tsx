"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Loader2, Undo2 } from "lucide-react";
import { completeAdventure, defsMap, discardAdventure, loadSession, recoverStaleAnalysis, unskipMission } from "@/lib/db";
import { getMission, getMode } from "@/lib/missions";
import { isResolved, summarize } from "@/lib/session";
import type { Mission, SessionMission } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";
import MissionPanel from "./MissionPanel";
import { btnGhost, btnPrimary, cardHover, Eyebrow } from "./ui";

const STATUS_LABEL: Record<SessionMission["status"], string> = {
  pending: "To find",
  analyzing: "Checking…",
  matched: "Verified by AI",
  manual: "Logged manually",
  skipped: "Skipped",
};

export default function AdventureSession({ id }: { id: number }) {
  const router = useRouter();
  const data = useLiveQuery(() => loadSession(id).then((s) => s ?? null), [id]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [leave, setLeave] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const recovered = useRef(false);

  // After a refresh nothing is analyzing any more; free any missions stuck in that state.
  useEffect(() => {
    if (recovered.current) return;
    recovered.current = true;
    void recoverStaleAnalysis(id);
  }, [id]);

  const completed = data?.adventure.status === "completed";
  useEffect(() => {
    if (completed && !finishing) router.replace(`/adventure/${id}/complete/`);
  }, [completed, finishing, id, router]);

  const missionMap = useMemo(() => {
    const m = new Map<string, Mission>();
    data?.defs.forEach((d) => {
      const full = getMission(d.id);
      if (full) m.set(d.id, full);
    });
    return m;
  }, [data]);

  if (data === undefined) return <main id="main" className="flex flex-1 items-center justify-center" aria-busy="true"><Loader2 className="animate-spin text-forest" aria-label="Loading" /></main>;
  if (data === null) {
    return (
      <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-6xl" aria-hidden>🗺️</p>
        <h1 className="text-3xl font-bold">Adventure not found</h1>
        <p className="text-muted">It may have been deleted from this device.</p>
        <Link href="/explore/" prefetch={false} className={`${btnPrimary} max-w-xs`}>Start a new adventure</Link>
      </main>
    );
  }

  const { adventure, items } = data;
  const mode = getMode(adventure.mode);
  const summary = summarize(adventure, items, defsMap(data.defs));
  const open = items.find((i) => i.id === openId);
  const openMission = open ? missionMap.get(open.missionId) : undefined;

  async function finish() {
    setFinishing(true);
    if (await completeAdventure(id)) router.push(`/adventure/${id}/complete/`);
    else setFinishing(false);
  }

  if (open && openMission) {
    return (
      <main id="main" className="flex flex-1 flex-col">
        <MissionPanel mission={openMission} sessionMission={open} onClose={() => setOpenId(null)} key={open.id} />
      </main>
    );
  }

  const allResolved = summary.pending === 0 && summary.total > 0;

  return (
    <main id="main" className="flex flex-1 flex-col gap-5">
      <header>
        <Eyebrow>{mode?.title ?? "Adventure"}</Eyebrow>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Your missions</h1>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Missions resolved" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.resolved}>
            <div className="h-full rounded-full bg-forest transition-[width] duration-500" style={{ width: `${(summary.resolved / Math.max(1, summary.total)) * 100}%` }} />
          </div>
          <span className="text-base font-bold tabular-nums" data-testid="progress">{summary.resolved}/{summary.total}</span>
        </div>
        <p className="mt-2 text-sm text-muted" data-testid="tally">{summary.matched} verified · {summary.manual} manual · {summary.skipped} skipped · <strong className="text-ink">{summary.points} pts</strong></p>
      </header>

      <ol className="grid gap-3 md:grid-cols-2">
        {items.map((it, i) => {
          const m = missionMap.get(it.missionId);
          if (!m) return null;
          const done = isResolved(it.status) && it.status !== "skipped";
          const skipped = it.status === "skipped";
          return (
            <li key={it.id} className="rise" style={{ animationDelay: `${i * 50}ms` }}>
              <div className={`${it.status === "pending" ? cardHover : ""} flex min-h-20 items-center gap-2 rounded-2xl border p-2 pr-3 ${done ? "border-forest/30 bg-lime/40" : "border-line bg-card"}`}>
                <button
                  onClick={() => setOpenId(it.id!)}
                  disabled={it.status !== "pending"}
                  data-testid={`mission-${m.id}`}
                  data-status={it.status}
                  className="flex min-h-16 flex-1 items-center gap-4 rounded-xl p-2 text-left disabled:cursor-default"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-cream text-3xl" aria-hidden>{m.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-lg font-bold leading-tight ${skipped ? "text-muted line-through" : ""}`}>{m.title}</span>
                    <span className="block text-sm text-muted">{STATUS_LABEL[it.status]}</span>
                  </span>
                  {it.status === "pending" && <ChevronRight size={22} className="text-muted" aria-hidden />}
                  {done && <span className="grid h-8 w-8 place-items-center rounded-full bg-forest text-white"><Check size={18} aria-hidden /></span>}
                </button>
                {skipped && (
                  <button onClick={() => void unskipMission(it.id!)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-forest">
                    <Undo2 size={16} aria-hidden /> Undo
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto flex flex-col gap-2">
        <button onClick={() => void finish()} disabled={!allResolved || finishing} className={btnPrimary} data-testid="finish">
          {allResolved ? "Finish adventure" : `${summary.pending} to go`}
        </button>
        {!allResolved && <p className="text-center text-sm text-muted">Skipping a mission counts as resolved. You can finish any time all are found or skipped.</p>}
        <button onClick={() => setLeave(true)} className={btnGhost}>Discard this adventure</button>
      </div>

      <ConfirmDialog
        open={leave}
        title="Discard this adventure?"
        body="Its missions and photos will be deleted from this device."
        confirmLabel="Discard adventure"
        onCancel={() => setLeave(false)}
        onConfirm={async () => { setLeave(false); await discardAdventure(id); router.replace("/explore/"); }}
      />
    </main>
  );
}
