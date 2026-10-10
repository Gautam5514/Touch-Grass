"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { parseAdventurePath } from "@/lib/route";
import AdventureComplete from "./AdventureComplete";
import AdventureSession from "./AdventureSession";
import { btnPrimary } from "./ui";

/** Reads the real URL (not the placeholder the shell was built for) and renders the matching view. */
export default function AdventureRouter() {
  const pathname = usePathname();
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    // The shell can be served for a different URL (host rewrite), so trust the browser's location.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPath(window.location.pathname);
  }, [pathname]);

  if (path === null) return <main id="main" className="flex flex-1" aria-busy="true" />;
  const { id, view } = parseAdventurePath(path);
  if (id === null) {
    return (
      <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-6xl" aria-hidden>🗺️</p>
        <h1 className="text-3xl font-bold">Pick an adventure</h1>
        <p className="text-muted">Choose how long you want to be outside.</p>
        <Link href="/explore/" prefetch={false} className={`${btnPrimary} max-w-xs`}>Explore adventures</Link>
      </main>
    );
  }
  return view === "complete" ? <AdventureComplete id={id} key={`c${id}`} /> : <AdventureSession id={id} key={`s${id}`} />;
}
