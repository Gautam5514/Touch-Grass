# Evaluation of the on-device verification

This documents how well CLIP ViT-B/32 plus WildQuest's decision rule separates correct from incorrect photos, what we changed because of it, and, just as important, what these numbers do **not** show.

Reproduce everything with `npm run eval` (dev set) and `npm run eval -- --set=heldout`. Raw output is in `eval/results/`.

## Setup

- **Model:** `Xenova/clip-vit-base-patch32`, q8, pinned to commit `d15189d7…`, run in Node (CPU) with the same prompts and decision rule as the app.
- **Photos:** 76 real photographs from Wikimedia Commons (licenses and authors in `eval/*/CREDITS.md`), chosen by eye from search results for each category.
  - `eval/dev` (44 photos): used while designing prompts.
  - `eval/heldout` (32 photos): different queries, chosen after the design was frozen, **evaluated once, never tuned on**.
- **Categories:** correct photos for each of the 7 missions, unrelated indoor and street photos, busy outdoor scenes (ambiguous, reported but not scored), and **blurred copies** of every correct photo (heavy Gaussian blur).
- **Protocol:** every photo is scored against every mission. A (photo, mission) pair is *positive* if the photo's subject is that mission, otherwise *negative*. Outcomes: `matched`, `uncertain`, `mismatch`.
  - TP = positive and matched. FN = positive and clearly rejected. *Uncertain* is neither: the user is asked to retake.
  - FP = negative and matched (the outcome that would wrongly award points).
- **Thresholds (unchanged throughout):** target score ≥ 0.45 and margin ≥ 0.15 over the best competing prompt.

## Results (sharp photos)

| Set | Positive pairs | Matched (TP) | Uncertain | Clear reject (FN) | Negative pairs | **False positives** | Uncertain | Correct reject |
|---|---|---|---|---|---|---|---|---|
| Dev | 28 | 25 | 2 | 1 | 238 | **0** | 28 | 210 |
| **Held-out** | 22 | **21** | 1 | 0 | 167 | **0** | 3 | 164 |
| Both | 50 | 46 (92%) | 3 | 1 | 405 | **0** | 31 | 374 |

None of the 70 + 35 indoor and street pairs matched any mission.

Cases that were not matched on sharp, correct photos:

- A hand holding a yellow-green leaf for "green leaf": the model preferred "dry fallen leaf" (clear reject, dev).
- A rock close-up for "rock": target 32%, uncertain (dev).
- A fallen leaf photo whose top idea was "green grass" 37% vs target 36%: uncertain (dev).
- A close-up of dewy grass blades for "grass": target 51%, too close to the alternatives: uncertain (held-out).

## What we changed because of the dev results

The first version of the prompts (a mission's own target plus 4 curated look-alikes and 4 shared negatives) accepted all 28 correct dev photos but produced **5 false positives**:

- All four rock close-ups also matched "tree trunk with bark" (59–87%): granite texture looks like bark.
- A blue forget-me-not flower matched "clear blue sky" (93%).

The fix is structural, not a threshold tweak: **every mission now also competes against every other mission's target** (`lib/missions.ts`). A rock has to look more like "a rock" than like "tree bark" or "grass". This removed all 5 false positives on the dev set at the cost of 3 of 28 correct photos (2 uncertain, 1 rejected). We then evaluated the held-out set once: 0 false positives and 21 of 22 correct photos accepted.

We also swept thresholds (`npm run eval -- --sweep`). Higher score thresholds trade more uncertainty for fewer false positives and did not beat the structural fix, so the defaults stayed.

## Blurry photos

| Set | Positive pairs | Matched | Uncertain | Clear reject | Negative pairs | False positives |
|---|---|---|---|---|---|---|
| Dev (blurred) | 28 | 15 | 12 | 1 | 168 | 1 |
| Held-out (blurred) | 22 | 12 | 9 | 1 | 132 | 1 |

About half of heavily blurred correct photos are still accepted and most of the rest become "uncertain", which is the desired failure mode. **Blur is a real weakness**: 2 of 300 negative blurred pairs matched the wrong mission (a blurred photo of a rock "matched" grass at 67%). The app does not detect blur.

## Busy outdoor scenes

Scenes with trees, grass and sky all in frame have no single right answer, so they are not scored. Across both sets, 1 of 77 scene×mission pairs matched: a meadow scene with a path matched "grass". That is arguably correct, and it shows the model verifies "this is in the photo", not "this is the main subject".

## Limits of this evaluation (read before quoting numbers)

- **Small.** 76 photos, 22 held-out positives. A single photo moves a percentage by ~4 points. Don't read 92% as a stable estimate.
- **Not phone photos.** Wikimedia photos are often better composed and lit than quick phone shots. Real-world accuracy outdoors is likely lower. No outdoor phone test has been done yet.
- **The dev set influenced the design.** Held-out numbers are the fairer ones, but we saw both sets' contact sheets while choosing photos, and the held-out set is still small.
- **Node vs browser.** The evaluation preprocesses with `sharp`, the app with canvas. Small numeric differences are expected. The browser path is exercised by `tests/e2e/real.spec.ts` (real CLIP in Chromium: a leaf and a sky photo matched, an indoor photo refused).
- **Not an anti-cheat system.** Someone can photograph a photo of a leaf. The goal is a nudge to go outside, not proof.
- CLIP scores are relative similarities across the supplied prompts, not calibrated probabilities. The UI says so.
