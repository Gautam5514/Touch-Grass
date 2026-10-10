import Link from "next/link";
import { btnPrimary } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl" aria-hidden>🧭</p>
      <h1 className="text-3xl font-bold">Off the trail</h1>
      <p className="text-muted">We couldn’t find that page. Let’s get you back on the path.</p>
      <Link href="/" className={`${btnPrimary} max-w-xs`}>Back to home</Link>
    </main>
  );
}
