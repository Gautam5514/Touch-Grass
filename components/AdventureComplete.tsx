"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Loader2, Plus, Share2, TreePine } from "lucide-react";
import { defsMap, loadSession } from "@/lib/db";
import { getMission, getMode } from "@/lib/missions";
import { formatDuration, summarize } from "@/lib/session";
import Photo from "./Photo";
import { btnPrimary, btnSecondary } from "./ui";

const when = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AdventureComplete({ id }: { id: number }) {
  const router = useRouter();
  const data = useLiveQuery(() => loadSession(id).then((s) => s ?? null), [id]);
  const [note, setNote] = useState<string>();
  const summary = useMemo(() => (data ? summarize(data.adventure, data.items, defsMap(data.defs)) : null), [data]);

  useEffect(() => {
    if (data && data.adventure.status === "active") router.replace(`/adventure/${id}/`);
  }, [data, id, router]);

  if (data === undefined) return <main id="main" className="flex flex-1 items-center justify-center" aria-busy="true"><Loader2 className="animate-spin text-forest" aria-label="Loading" /></main>;
  if (data === null || !summary) {
    return (
      <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-3xl font-bold">Adventure not found</h1>
        <p className="text-muted">It may have been deleted from this device.</p>
        <Link href="/explore/" prefetch={false} className={`${btnPrimary} max-w-xs`}>Start a new adventure</Link>
      </main>
    );
  }

  const { adventure, discoveries } = data;
  const mode = getMode(adventure.mode);
  const text = `🌿 WildQuest AI: ${summary.matched} of ${summary.total} discoveries verified by on-device open-source AI${summary.manual ? `, ${summary.manual} logged manually` : ""}, in ${formatDuration(summary.durationMs)}. Now I’m putting my phone away.`;

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "WildQuest AI", text });
      else {
        await navigator.clipboard.writeText(text);
        setNote("Summary copied to clipboard");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("Sharing isn’t available here");
    }
  }

  return (
    <main id="main" className="flex flex-1 flex-col gap-6">
      <header className="rise pt-2 text-center">
        <div className="pop mx-auto grid h-28 w-28 place-items-center rounded-full bg-lime text-6xl" aria-hidden>{summary.badge.emoji}</div>
        <p className="mt-4 text-sm font-bold uppercase tracking-widest text-forest/80">{mode?.title ?? "Adventure"} complete</p>
        <h1 className="mt-1 text-4xl font-extrabold leading-tight tracking-tight" data-testid="headline">{summary.matched} of {summary.total} verified</h1>
        <p className="mt-1 text-lg text-muted">Badge: <strong className="text-ink">{summary.badge.name}</strong>. {summary.badge.blurb}</p>
      </header>

      <dl className="rise grid grid-cols-2 gap-2 text-center md:grid-cols-4" style={{ animationDelay: "80ms" }} data-testid="stats">
        {[
          ["AI-verified", summary.matched],
          ["Manual", summary.manual],
          ["Skipped", summary.skipped],
          ["Points", `${summary.points}/${summary.maxPoints}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-card py-3">
            <dd className="text-2xl font-bold tabular-nums">{v}</dd>
            <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
          </div>
        ))}
      </dl>

      <p className="rise text-center text-sm text-muted" style={{ animationDelay: "100ms" }}>
        Started {when(adventure.startedAt)} · Finished {adventure.completedAt ? when(adventure.completedAt) : "—"} · {formatDuration(summary.durationMs)}
      </p>

      {discoveries.length > 0 && (
        <ul className="rise grid grid-cols-3 gap-2 md:grid-cols-5" style={{ animationDelay: "140ms" }} aria-label="Your discoveries">
          {discoveries.map((d) => {
            const sm = data.items.find((i) => i.id === d.sessionMissionId);
            const m = sm ? getMission(sm.missionId) : undefined;
            return (
              <li key={d.id} className="relative aspect-square overflow-hidden rounded-xl">
                <Photo blob={d.thumbnail} alt={m?.title ?? "Discovery"} className="h-full w-full object-cover" />
                <span className="absolute bottom-1 right-1 rounded-md bg-white/90 px-1.5 py-0.5 text-xs font-bold">{d.source === "ai" ? "AI ✓" : "Manual"}</span>
              </li>
            );
          })}
        </ul>
      )}

      <section className="rise rounded-3xl bg-forest p-6 text-center text-cream" style={{ animationDelay: "200ms" }}>
        <TreePine className="mx-auto" size={30} aria-hidden />
        <p className="mt-2 text-2xl font-bold leading-snug">Now put the phone away.</p>
        <p className="mt-1 text-cream/90">Listen for birds. Notice the light. The best part doesn’t need a screen.</p>
      </section>

      <div className="mt-auto flex flex-col gap-2 md:flex-row">
        <Link href="/journal/" prefetch={false} className={btnPrimary}><BookOpen size={20} aria-hidden /> View journal</Link>
        <Link href="/explore/" prefetch={false} className={btnSecondary}><Plus size={20} aria-hidden /> Start another adventure</Link>
        <button onClick={() => void share()} className={btnSecondary}><Share2 size={20} aria-hidden /> Share summary</button>
      </div>
      {note && <p role="status" className="text-center text-sm text-muted">{note}</p>}
    </main>
  );
}
