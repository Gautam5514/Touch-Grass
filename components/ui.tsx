import Link from "next/link";

const base =
  "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 text-lg font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimary = `${base} bg-forest text-white shadow-[0_4px_0_var(--forest-deep)] active:translate-y-0.5 active:shadow-none hover:brightness-110`;
export const btnLime = `${base} bg-lime text-forest-deep shadow-[0_4px_0_var(--lime-deep)] active:translate-y-0.5 active:shadow-none hover:brightness-105`;
export const btnSecondary = `${base} border-2 border-forest bg-transparent text-forest hover:bg-forest/5`;
export const btnGhost = `${base} text-muted underline-offset-4 hover:underline`;
export const btnDanger = `${base} border-2 border-danger bg-transparent text-danger hover:bg-danger/5`;

/** Add to a clickable card/button for a subtle lift on mouse/trackpad hover (no-op on touch). */
export const cardHover = "lift";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="mb-3 inline-flex min-h-11 items-center text-base font-semibold text-forest hover:underline underline-offset-4">
      <span aria-hidden>←</span>&nbsp;{children}
    </Link>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-bold uppercase tracking-widest text-forest/80">{children}</p>;
}

export function Card({ children, className = "", as: Tag = "section", ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "li" | "article" }) {
  return (
    <Tag className={`rounded-2xl border border-line bg-card p-4 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-current border-t-transparent ${className}`} />;
}
