---
title: WildQuest AI: nature missions checked by an open-weight model that never leaves your phone
published: false
tags: devchallenge, hf26challenge
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

Most apps are built to keep your eyes on the screen. **WildQuest AI** uses the screen to get you out the door, and then asks you to put it away.

You pick an adventure (3, 5 or 7 missions, about 5 to 20 minutes) and get small things to find outside: a green leaf, a flower, a tree trunk, the sky, grass, a rock, a fallen leaf. You photograph each one. An **open-weight vision model running in your browser** decides whether the photo plausibly contains the thing. At the end the app says: *"Now put the phone away."*

It's an installable web app (PWA). No account, no feed, no streaks, no upload.

**Explore more. Scroll less.** Your next adventure is outside.

## Demo

- **Live app:** TODO_DEPLOYED_URL
- **Video (real outdoor test):** TODO_VIDEO_URL
- **Code:** TODO_GITHUB_URL

*Add 3 or 4 screenshots from `docs/screenshots/` (missions, a match, a "not sure yet", the Offline ready card).*

## How I Built It

**Stack:** Next.js (static export) · React · TypeScript · Tailwind · Dexie/IndexedDB · Transformers.js · ONNX Runtime Web · a service worker.

**The model.** `Xenova/clip-vit-base-patch32`, OpenAI's CLIP in ONNX, quantized to about 90 MB and pinned to an exact commit. It runs in a Web Worker so the UI stays smooth. Nothing is trained: CLIP scores a photo against short text prompts, so a mission is just a sentence.

**The interesting part is saying "I'm not sure."** CLIP returns *relative* similarities across whatever prompts you give it, not "90% certain it's a leaf". So the decision rule is deliberately strict: the target must rank first, clear a score bar, and lead its closest competitor by a margin. Otherwise the result is *uncertain* (retake it, or log it yourself, labeled as manual and worth no AI points). Each mission also competes against every other mission's target, so a rock has to look more like "a rock" than like "tree bark".

```
camera → resize → Web Worker (CLIP, WASM) → verify() → one IndexedDB transaction
```

**I measured it, and it changed the design.** I built a small evaluation harness over 76 real Wikimedia photos (including blurred copies, indoor scenes and busy outdoor scenes). My first prompts accepted every correct photo but also produced 5 false positives, for instance rock close-ups matching "tree bark" and a blue flower matching "clear sky". Adding the other missions' targets as rivals removed all of them. I then ran a held-out set once without tuning: **0 false positives** across 405 sharp negative pairs, and 46 of 50 correct photos accepted (21 of 22 on held-out). Blur is a weakness: about half of heavily blurred correct photos still pass, and 2 of 300 wrong blurred pairs matched. The set is small and not phone-shot, so treat these as indicative, not a benchmark. Full write-up: `docs/EVALUATION.md`.

**"Offline ready" has to be earned.** The app has five offline states, and `OFFLINE_READY` only appears after a real test: a fresh worker loads the model with network access blocked and runs an inference, while the service worker, pages, WASM and weights are all confirmed present. Building this taught me two things the hard way:

1. Transformers.js binds `fetch` when it's imported, so my first "network blocked" self-test blocked nothing and passed vacuously.
2. The library probes the `main` revision for `tokenizer_config.json` even when you pin a commit, which breaks offline loading after the first visit.

My end-to-end test caught both. I fixed them, and I also confirmed the self-test **fails** (and the app shows an error rather than "Offline ready") when I deliberately remove the fix.

**Tests:** 52 unit tests (verification rule, state machine, points, Dexie transactions, deletion), 17 Playwright flow tests with deterministic AI scores, and a real-model Playwright test that runs actual CLIP in Chromium, records every network request to assert photos are never uploaded, then goes offline and verifies a new photo.

## Why Open Innovation Matters

- **Privacy by architecture.** Nature photos often include kids, homes and places. With an open-weight model in the browser, there's no server to send them to. I verified it: the real-model test asserts zero non-GET requests and no hosts besides the app and the model host.
- **It works where the walk is.** Parks have bad signal, and open weights can live on the device.
- **No per-photo cost.** A free app stays free, because inference uses the user's own hardware.
- **Inspectable and swappable.** Weights, runtime and mission prompts are all open. Changing a mission is editing a sentence.

## Limits, honestly

- CLIP can be fooled by look-alikes, blur and busy scenes, and anyone can photograph a picture of a leaf. This is a nudge to go outside, not proof.
- I have **not yet tested on a physical phone or on a real outdoor walk**; everything above ran in desktop Chromium. TODO: add your real-device results and any failures here.
- Offline needs one online visit first, and browsers can evict saved storage. The app re-checks and downgrades the badge if that happens.

## Prize Categories

- **Best Use of Render:** hosted as a static site on Render. TODO: confirm once deployed (it needs the `/adventure/*` rewrite in `render.yaml`).

*Credits: CLIP (MIT, OpenAI), Xenova's ONNX conversion, Transformers.js (Apache-2.0), ONNX Runtime Web (MIT), Next.js, Dexie, Tailwind; evaluation photos from Wikimedia Commons (credits in the repo). TODO: teammates' DEV usernames, if any.*
