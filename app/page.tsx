"use client";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Lock, Sprout, WifiOff } from "lucide-react";
import { db, updateSettings } from "@/lib/db";
import { useActiveAdventure } from "@/lib/hooks";
import { isResolved } from "@/lib/session";
import { btnLime, btnPrimary, Card, Eyebrow } from "@/components/ui";

const STEPS = [
  { Icon: Sprout, title: "Pick an adventure", body: "Three, five or seven small finds, from a leaf to the sky." },
  { Icon: Camera, title: "Find it, snap it", body: "Look around. Photograph what you discover." },
  { Icon: Lock, title: "AI checks on-device", body: "An open-weight model runs on your phone. Nothing is uploaded." },
];

export default function Home() {
  const active = useActiveAdventure();
  const items = useLiveQuery(async () => (active?.id ? db.sessionMissions.where("adventureId").equals(active.id).toArray() : []), [active?.id]);
  const resolved = items?.filter((i) => isResolved(i.status)).length ?? 0;

  return (
    <main id="main" className="flex flex-1 flex-col gap-6">
      <header className="rise pt-2">
        <div className="mb-6 flex items-center gap-2 text-forest">
          <Sprout size={26} aria-hidden />
          <span className="text-xl font-bold tracking-tight">WildQuest AI</span>
        </div>
        <h1 className="text-[2.7rem] font-extrabold leading-[1.02] tracking-tight md:text-6xl">
          Explore more. <span className="text-forest">Scroll less.</span>
        </h1>
        <p className="mt-3 text-xl text-muted">Your next adventure is outside.</p>
        <p className="mt-2 max-w-prose text-muted">
          Short nature missions for a walk. Photograph what you find and open-source AI on your phone checks it. Your photos stay on this device.
        </p>
      </header>

      {active && items && (
        <Card className="rise !border-forest/30 !bg-lime/40" style={{ animationDelay: "60ms" }}>
          <Eyebrow>Adventure in progress</Eyebrow>
          <p className="mt-1 text-lg font-bold">{resolved} of {items.length} missions done</p>
          <Link href={`/adventure/${active.id}/`} prefetch={false} className={`${btnPrimary} mt-3`}>Continue adventure</Link>
        </Card>
      )}

      <div className="rise" style={{ animationDelay: "100ms" }}>
        <Link href="/explore/" prefetch={false} onClick={() => void updateSettings({ onboardingCompleted: true }).catch(() => {})} className={active ? "hidden" : btnLime} data-testid="start-exploring">
          Start exploring
        </Link>
        {active && (
          <Link href="/explore/" prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-forest underline underline-offset-4">Start a different adventure</Link>
        )}
      </div>

      <section aria-labelledby="how" className="rise" style={{ animationDelay: "140ms" }}>
        <h2 id="how" className="text-lg font-bold">How it works</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {STEPS.map(({ Icon, title, body }, i) => (
            <li key={title}>
              <Card as="div" className="h-full">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/60 text-forest"><Icon size={20} aria-hidden /></span>
                  <span className="text-sm font-bold text-forest">Step {i + 1}</span>
                </div>
                <p className="mt-2 font-bold">{title}</p>
                <p className="text-sm text-muted">{body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <Card className="rise flex gap-3" style={{ animationDelay: "180ms" }}>
        <WifiOff size={22} className="mt-0.5 shrink-0 text-forest" aria-hidden />
        <p className="text-sm text-muted">
          The AI model (about 90 MB) downloads once. After that, WildQuest can work offline. We’ll tell you honestly in <Link href="/settings/" prefetch={false} className="font-semibold text-forest underline">Settings</Link> when that’s verified.{" "}
          <Link href="/about/" prefetch={false} className="font-semibold text-forest underline">How it works</Link> · <Link href="/privacy/" prefetch={false} className="font-semibold text-forest underline">Privacy</Link>
        </p>
      </Card>
    </main>
  );
}
