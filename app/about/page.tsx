import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, Card, Eyebrow, btnPrimary } from "@/components/ui";

export const metadata: Metadata = { title: "About" };

export default function About() {
  return (
    <main id="main" className="flex flex-1 flex-col gap-6">
      <header>
        <BackLink href="/">Home</BackLink>
        <Eyebrow>About</Eyebrow>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Explore more. Scroll less.</h1>
        <p className="mt-2 text-lg text-muted">Most apps want more of your screen time. WildQuest uses the screen to get you outside, then asks you to put it away.</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="list-decimal space-y-2 pl-6 text-muted">
          <li><strong className="text-ink">Pick an adventure.</strong> Three, five or seven small missions, like finding a leaf or photographing the sky.</li>
          <li><strong className="text-ink">Photograph what you find.</strong> Use your camera or choose a photo.</li>
          <li><strong className="text-ink">AI compares it on your device.</strong> The photo is scored against short text descriptions: your target, look-alikes, and unrelated things.</li>
          <li><strong className="text-ink">A clear win counts.</strong> If your target leads by enough, the mission is verified. If not, you can retake the photo or log it yourself.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">The open-weight model</h2>
        <Card className="text-muted">
          <p>
            WildQuest runs <strong className="text-ink">CLIP ViT-B/32</strong>, an open-weight vision-language model from OpenAI (MIT license), in the ONNX build{" "}
            <a className="font-semibold text-forest underline" href="https://huggingface.co/Xenova/clip-vit-base-patch32" target="_blank" rel="noreferrer">Xenova/clip-vit-base-patch32</a>,
            using Transformers.js and ONNX Runtime Web. It runs in a background worker on your device.
          </p>
          <p className="mt-2">CLIP gives <em>relative similarity</em> scores, not the chance that you’re right. It can be fooled by look-alikes, bad light or blur. That’s why unclear results are called “not sure”, and why manual logging exists and is labeled as manual.</p>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Why open weights matter here</h2>
        <ul className="list-disc space-y-1 pl-6 text-muted">
          <li><strong className="text-ink">Privacy:</strong> the model comes to your photo, so your photo doesn’t go to a server.</li>
          <li><strong className="text-ink">Parks have bad signal:</strong> weights can be saved on the device.</li>
          <li><strong className="text-ink">No per-photo cost:</strong> it runs on your own hardware.</li>
          <li><strong className="text-ink">Inspectable:</strong> the model, runtime and mission prompts are all open.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Credits</h2>
        <p className="text-sm text-muted">
          CLIP (OpenAI, MIT) · Xenova ONNX conversion · Transformers.js (Apache-2.0) · ONNX Runtime Web (MIT) · Next.js, React, Tailwind CSS, Dexie, Lucide (MIT/ISC) · Inter (SIL OFL). Built for the DEV Hacktoberfest “Touch Grass” challenge.
        </p>
      </section>

      <Link href="/explore/" prefetch={false} className={`${btnPrimary} mt-auto`}>Start exploring</Link>
    </main>
  );
}
