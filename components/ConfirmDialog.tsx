"use client";
import { useEffect, useRef } from "react";
import { btnDanger, btnSecondary, btnPrimary } from "./ui";

/** Native <dialog>: focus trap, Escape to close and inert background come for free. */
export default function ConfirmDialog({
  open, title, body, confirmLabel, danger = true, onConfirm, onCancel,
}: { open: boolean; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="confirm-title" className="m-auto w-[min(92vw,26rem)] rounded-3xl bg-cream p-6 shadow-xl">
      <h2 id="confirm-title" className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-muted">{body}</p>
      <div className="mt-5 flex flex-col gap-2">
        <button onClick={onConfirm} className={danger ? btnDanger : btnPrimary}>{confirmLabel}</button>
        <button onClick={onCancel} className={btnSecondary} autoFocus>Cancel</button>
      </div>
    </dialog>
  );
}
