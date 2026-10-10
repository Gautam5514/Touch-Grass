"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Cpu, Download, MapPin, Trash2 } from "lucide-react";
import { AI_ERROR_HELP, deleteModelCache, isLowMemoryDevice, MODEL_INFO, missingFeatures } from "@/lib/ai/classifier";
import { clearAllData, updateSettings } from "@/lib/db";
import { useSettings } from "@/lib/hooks";
import { getApproxLocation } from "@/lib/location";
import AiStatus from "@/components/AiStatus";
import ConfirmDialog from "@/components/ConfirmDialog";
import OfflineCard from "@/components/OfflineCard";
import { btnDanger, btnSecondary, Card, Eyebrow } from "@/components/ui";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

const mb = (n?: number) => (n === undefined ? "unknown" : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function SettingsPage() {
  const settings = useSettings();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [confirm, setConfirm] = useState<"data" | "model" | null>(null);
  const [msg, setMsg] = useState<string>();
  const [locMsg, setLocMsg] = useState<string>();

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  async function refreshStorage() {
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setStorage({ usage: est?.usage, quota: est?.quota, persisted });
    } catch {
      setStorage({});
    }
  }
  useEffect(() => {
    // Reads external browser state once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStorage();
  }, []);

  async function toggleLocation() {
    setLocMsg(undefined);
    if (settings.locationEnabled) {
      await updateSettings({ locationEnabled: false });
      return;
    }
    // Permission is requested only now, in response to this tap.
    const r = await getApproxLocation(8000);
    if (r.ok) {
      await updateSettings({ locationEnabled: true });
      setLocMsg("Location is on. Future discoveries save an approximate spot (about 1 km) on this device only.");
    } else {
      setLocMsg(r.reason === "denied" ? "Location permission was denied, so it stays off. WildQuest works fine without it." : r.reason === "unsupported" ? "This browser doesn’t support location." : "Couldn’t get a location right now. It stays off.");
    }
  }

  const missing = typeof window === "undefined" ? [] : missingFeatures();

  return (
    <main id="main" className="flex flex-1 flex-col gap-6">
      <header>
        <Eyebrow>Settings</Eyebrow>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Privacy &amp; device</h1>
      </header>

      <section aria-labelledby="priv" className="flex flex-col gap-2">
        <h2 id="priv" className="text-lg font-bold">Privacy</h2>
        <Card className="text-sm text-muted">
          <ul className="list-disc space-y-1 pl-5">
            <li>Photos are analyzed on this device. They aren’t uploaded for classification.</li>
            <li>Adventures and photos are saved in this browser only. Clearing browser data erases them.</li>
            <li>The AI model downloads once from this site itself, not a third party.</li>
            <li>Location is off unless you turn it on below.</li>
          </ul>
          <Link href="/privacy/" prefetch={false} className="mt-2 inline-flex min-h-11 items-center font-semibold text-forest underline underline-offset-4">Read the full privacy page</Link>
        </Card>
      </section>

      <section aria-labelledby="model" className="flex flex-col gap-2">
        <h2 id="model" className="text-lg font-bold">AI model</h2>
        <Card as="div">
          <div className="flex items-center gap-3"><Cpu size={20} className="text-forest" aria-hidden /><p className="font-bold">{MODEL_INFO.id}</p></div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Version</dt><dd>{MODEL_INFO.version}</dd>
            <dt className="text-muted">Size</dt><dd>about {MODEL_INFO.approxMb} MB (quantized)</dd>
            <dt className="text-muted">Runs on</dt><dd>this device (WebAssembly, in a background worker)</dd>
          </dl>
        </Card>
        <AiStatus />
        {missing.length > 0 && <Card className="!bg-warn-bg text-sm text-warn">{AI_ERROR_HELP.unsupported.message} Missing: {missing.join(", ")}.</Card>}
        {isLowMemoryDevice() && <Card className="!bg-warn-bg text-sm text-warn">This device reports very little memory, so the AI may fail. Manual logging still works.</Card>}
      </section>

      <section aria-labelledby="offline" className="flex flex-col gap-2">
        <h2 id="offline" className="text-lg font-bold">Offline</h2>
        <OfflineCard />
      </section>

      <section aria-labelledby="loc" className="flex flex-col gap-2">
        <h2 id="loc" className="text-lg font-bold">Location (optional)</h2>
        <Card as="div">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-semibold"><MapPin size={18} className="text-forest" aria-hidden /> Save approximate location</p>
              <p className="text-sm text-muted">Adds a rough spot to each discovery. Stored only on this device. It doesn’t prove a photo was taken outdoors.</p>
            </div>
            <button role="switch" aria-checked={settings.locationEnabled} aria-label="Save approximate location" onClick={() => void toggleLocation()} data-testid="location-toggle"
              className="grid min-h-11 min-w-16 shrink-0 place-items-center">
              <span className={`relative block h-9 w-16 rounded-full transition ${settings.locationEnabled ? "bg-forest" : "bg-line"}`}>
                <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${settings.locationEnabled ? "left-8" : "left-1"}`} />
              </span>
            </button>
          </div>
          {locMsg && <p role="status" className="mt-2 text-sm text-muted">{locMsg}</p>}
        </Card>
      </section>

      <section aria-labelledby="install" className="flex flex-col gap-2">
        <h2 id="install" className="text-lg font-bold">Install</h2>
        <Card as="div" className="text-sm text-muted">
          {install ? (
            <button onClick={async () => { await install.prompt(); setInstall(null); }} className={btnSecondary}><Download size={20} aria-hidden /> Install WildQuest</button>
          ) : (
            <p>Install from your browser menu (“Install app” or “Add to Home Screen”) for a full-screen app that opens faster.</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="data" className="flex flex-col gap-2">
        <h2 id="data" className="text-lg font-bold">Your data</h2>
        <Card as="div" className="text-sm text-muted">
          <p>Storage used: <strong className="text-ink">{mb(storage.usage)}</strong> of {mb(storage.quota)} available{storage.persisted ? " (protected from automatic clearing)" : ""}.</p>
          <div className="mt-3 flex flex-col gap-2">
            <button onClick={() => setConfirm("data")} className={btnDanger} data-testid="clear-data"><Trash2 size={18} aria-hidden /> Delete all adventures &amp; photos</button>
            <button onClick={() => setConfirm("model")} className={btnSecondary}>Remove downloaded AI &amp; offline files</button>
          </div>
          {msg && <p role="status" className="mt-3 font-semibold text-forest" data-testid="settings-msg">{msg}</p>}
        </Card>
      </section>

      <p className="text-center text-sm text-muted">
        <Link href="/about/" prefetch={false} className="font-semibold text-forest underline">How WildQuest works</Link> · <Link href="/privacy/" prefetch={false} className="font-semibold text-forest underline">Privacy</Link>
      </p>

      <ConfirmDialog
        open={confirm === "data"}
        title="Delete everything saved?"
        body="This permanently deletes every adventure, discovery photo and setting on this device. The downloaded AI stays."
        confirmLabel="Delete all data"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); await clearAllData(); setMsg("All adventures and photos were deleted."); void refreshStorage(); }}
      />
      <ConfirmDialog
        open={confirm === "model"}
        title="Remove the downloaded AI?"
        body="WildQuest will need to download the AI (about 90 MB) again before it can analyze photos, and offline use will stop until you set it up again."
        confirmLabel="Remove AI & offline files"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await deleteModelCache();
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith("wq-")).map((k) => caches.delete(k)));
          await updateSettings({ offlineReady: false, offlineVerifiedAt: undefined });
          setMsg("Removed. Reload the page to see the updated status.");
          void refreshStorage();
        }}
      />
    </main>
  );
}
