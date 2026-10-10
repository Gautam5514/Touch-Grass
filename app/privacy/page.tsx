import type { Metadata } from "next";
import { BackLink, Card, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy" };

const ITEMS = [
  ["Photos are analyzed on your device.", "The AI runs in your browser. WildQuest doesn’t send your photos to a classification server."],
  ["Discoveries are saved in browser storage.", "Adventures, thumbnails and compressed photos live in IndexedDB on this device. There are no accounts."],
  ["You can delete your data.", "Delete single photos from the journal, or everything from Settings. You can also remove the downloaded AI."],
  ["The model downloads from this site itself.", "The AI files are self-hosted here, not fetched from a third party like Hugging Face at runtime, so no outside host ever sees that a download happened. The open-weight model (Xenova/clip-vit-base-patch32) is still credited on the About page."],
  ["Location is optional and off by default.", "If you turn it on in Settings, a rounded location (about 1 km) is saved with each discovery, on this device only."],
  ["Clearing browser data erases saved adventures.", "Because everything is local, clearing site data, switching browsers or devices, or private browsing can remove or hide your journal."],
];

export default function Privacy() {
  return (
    <main id="main" className="flex flex-1 flex-col gap-5">
      <header>
        <BackLink href="/settings/">Settings</BackLink>
        <Eyebrow>Privacy</Eyebrow>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Your photos stay yours</h1>
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {ITEMS.map(([t, b]) => (
          <li key={t}><Card as="div" className="h-full"><p className="font-bold">{t}</p><p className="mt-1 text-muted">{b}</p></Card></li>
        ))}
      </ul>
      <p className="text-sm text-muted">The site is served by a static host that may keep ordinary access logs (for example your IP address and the pages requested). It never receives your photos. Using the “share summary” button shares only the text you see.</p>
    </main>
  );
}
