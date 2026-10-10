"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MapPin, Trash2, X } from "lucide-react";
import { db, deleteDiscovery } from "@/lib/db";
import { getMission } from "@/lib/missions";
import type { Discovery } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog";
import Photo from "@/components/Photo";
import { btnDanger, btnPrimary, cardHover, Eyebrow } from "@/components/ui";

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const plain = (l?: string) => (l ?? "").replace(/^an? (close-up )?photo of (an? |the )?/, "");

function Status({ d }: { d: Discovery }) {
  return d.source === "ai"
    ? <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-bold text-forest-deep">AI-matched</span>
    : <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-bold text-muted ring-1 ring-line">Manual</span>;
}

function Detail({ d, onClose, onDelete }: { d: Discovery; onClose: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [showLoc, setShowLoc] = useState(false);
  const sm = useLiveQuery(() => db.sessionMissions.get(d.sessionMissionId), [d.sessionMissionId]);
  const mission = sm ? getMission(sm.missionId) : undefined;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="detail-title" className="m-auto max-h-[92dvh] w-[min(94vw,32rem)] overflow-auto rounded-3xl bg-cream p-0 shadow-xl">
      <Photo blob={d.image ?? d.thumbnail} alt={mission?.title ?? "Discovery"} className="aspect-[4/3] w-full bg-line object-cover" />
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="detail-title" className="text-2xl font-bold leading-tight">{mission?.emoji} {mission?.title ?? "Discovery"}</h2>
            {mission && <p className="text-muted">{mission.description}</p>}
          </div>
          <button onClick={() => ref.current?.close()} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white"><X size={20} aria-hidden /></button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Captured</dt><dd>{new Date(d.capturedAt).toLocaleString()}</dd>
          <dt className="text-muted">Status</dt><dd><Status d={d} /></dd>
          {d.source === "ai" ? (
            <>
              <dt className="text-muted">Top result</dt><dd>{plain(d.predictedLabel)}</dd>
              <dt className="text-muted">Similarity</dt><dd>{Math.round((d.score ?? 0) * 100)}% <span className="text-muted">(relative, not a probability)</span></dd>
              <dt className="text-muted">Margin</dt><dd>{Math.round((d.margin ?? 0) * 100)}%</dd>
              <dt className="text-muted">Model</dt><dd className="break-all">{d.modelId} <span className="text-muted">({d.modelVersion})</span></dd>
            </>
          ) : (
            <><dt className="text-muted">Verification</dt><dd>Logged by you, not checked by AI</dd></>
          )}
        </dl>
        {d.approximateLocation && (
          <div className="text-sm">
            <button onClick={() => setShowLoc((v) => !v)} className="inline-flex min-h-11 items-center gap-2 font-semibold text-forest"><MapPin size={16} aria-hidden /> {showLoc ? "Hide" : "Show"} approximate location</button>
            {showLoc && <p className="text-muted">About {d.approximateLocation.lat}, {d.approximateLocation.lon} (rounded to roughly 1 km, stored only on this device).</p>}
          </div>
        )}
        <button onClick={onDelete} className={btnDanger} data-testid="delete-discovery"><Trash2 size={18} aria-hidden /> Delete this photo</button>
      </div>
    </dialog>
  );
}

export default function Journal() {
  const items = useLiveQuery(() => db.discoveries.orderBy("capturedAt").reverse().toArray(), []);
  const missionFor = useLiveQuery(async () => new Map((await db.sessionMissions.toArray()).map((s) => [s.id!, s.missionId])), []);
  const completed = useLiveQuery(() => db.adventures.where("status").equals("completed").count(), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const open = items?.find((d) => d.id === openId);

  return (
    <main id="main" className="flex flex-1 flex-col gap-5">
      <header>
        <Eyebrow>Discovery journal</Eyebrow>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">What you’ve found</h1>
        {items && <p className="mt-1 text-muted">{items.length} {items.length === 1 ? "discovery" : "discoveries"} · {completed ?? 0} {completed === 1 ? "adventure" : "adventures"} completed</p>}
      </header>

      {items === undefined && <p className="text-muted" aria-busy="true">Loading…</p>}
      {items && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line p-8 text-center">
          <p className="text-4xl" aria-hidden>🌱</p>
          <p className="font-bold">Nothing here yet</p>
          <p className="text-muted">Head outside. Your discoveries will gather here.</p>
          <Link href="/explore/" prefetch={false} className={`${btnPrimary} max-w-xs`}>Start an adventure</Link>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items?.map((d) => {
          const m = getMission(missionFor?.get(d.sessionMissionId) ?? "");
          return (
            <li key={d.id} className={`${cardHover} overflow-hidden rounded-2xl border border-line bg-card`} data-testid="journal-card">
              <button onClick={() => setOpenId(d.id!)} className="block w-full text-left" aria-label={`Open ${m?.title ?? "discovery"}, ${day(d.capturedAt)}`}>
                <Photo blob={d.thumbnail} alt="" className="aspect-square w-full bg-line object-cover" />
                <span className="flex flex-col gap-1 p-3">
                  <span className="truncate font-bold">{m?.emoji} {m?.title ?? "Discovery"}</span>
                  <span className="text-xs text-muted">{day(d.capturedAt)}</span>
                  <Status d={d} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open && <Detail key={open.id} d={open} onClose={() => setOpenId(null)} onDelete={() => setConfirmId(open.id!)} />}
      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this photo?"
        body="It will be removed from this device. The adventure’s score stays as it was."
        confirmLabel="Delete photo"
        onCancel={() => setConfirmId(null)}
        onConfirm={async () => {
          if (confirmId !== null) await deleteDiscovery(confirmId);
          setConfirmId(null);
          setOpenId(null);
        }}
      />
    </main>
  );
}
