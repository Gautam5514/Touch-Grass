"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, Home, Settings, Sprout } from "lucide-react";

const items = [
  { href: "/", label: "Home", Icon: Home, match: (p: string) => p === "/" },
  { href: "/explore/", label: "Explore", Icon: Compass, match: (p: string) => p.startsWith("/explore") || p.startsWith("/adventure") },
  { href: "/journal/", label: "Journal", Icon: BookOpen, match: (p: string) => p.startsWith("/journal") },
  { href: "/settings/", label: "Settings", Icon: Settings, match: (p: string) => p.startsWith("/settings") || p.startsWith("/about") || p.startsWith("/privacy") },
];

/** Bottom tab bar for phones and tablets. Hidden at desktop widths in favor of SideNav. */
export default function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto flex max-w-md md:max-w-3xl">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-semibold transition ${active ? "text-forest" : "text-muted"}`}
              >
                <Icon size={24} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Persistent left sidebar for desktop widths (lg+). Hidden on phones and tablets, where BottomNav runs instead. */
export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-card/70 px-5 py-8 lg:flex">
      <Link href="/" prefetch={false} className="mb-10 flex items-center gap-2 px-2 text-forest">
        <Sprout size={26} aria-hidden />
        <span className="text-xl font-bold tracking-tight">WildQuest AI</span>
      </Link>
      <ul className="flex flex-col gap-1">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold transition hover:bg-lime/30 ${active ? "bg-lime/50 text-forest" : "text-muted"}`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto px-2 text-xs text-muted">Photos never leave this device.</p>
    </nav>
  );
}
