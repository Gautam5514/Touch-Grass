/**
 * Evaluates the real CLIP model + verification rule on labeled local photos (eval/dev and eval/heldout).
 *
 *   npm run eval                      # dev set, current thresholds
 *   npm run eval -- --set=heldout     # held-out set (never tuned on)
 *   npm run eval -- --sweep           # also print FP/FN for a grid of thresholds
 *   npm run eval -- --min-score=0.5 --min-margin=0.2
 *
 * Every photo is scored against every mission. A (photo, mission) pair is a positive when the photo's
 * labeled truth includes that mission, otherwise a negative. Busy outdoor scenes ("multi") have no
 * single right answer, so they are reported but excluded from FP/FN. Blurry cases are the correct
 * photos after a heavy Gaussian blur; for those, "uncertain" is an acceptable outcome.
 *
 * Preprocessing mirrors the app (long edge <= 448, RGB) but uses sharp instead of canvas, so small
 * numeric differences from the browser are expected.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { pipeline, RawImage } from "@huggingface/transformers";
import { MODEL_DTYPE, MODEL_ID, MODEL_REVISION, MODEL_VERSION, DEFAULT_VERIFY_PARAMS, MAX_AI_DIMENSION } from "../lib/ai/config";
import { verify } from "../lib/ai/verify";
import { MISSIONS } from "../lib/missions";
import type { RankedLabel, VerifyOutcome, VerifyParams } from "../lib/types";

type Kind = "correct" | "unrelated" | "multi" | "blurry";
interface Label { file: string; kind: Exclude<Kind, "blurry">; truth: string[]; source: string }
interface Pair { file: string; kind: Kind; mission: string; positive: boolean; scores: RankedLabel[] }

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const params: VerifyParams = {
  ...DEFAULT_VERIFY_PARAMS,
  ...(flag("min-score") ? { minScore: Number(flag("min-score")) } : {}),
  ...(flag("min-margin") ? { minMargin: Number(flag("min-margin")) } : {}),
};

const SET = flag("set") ?? "dev";
const DIR = `eval/${SET}`;
const labels: Label[] = JSON.parse(readFileSync(`${DIR}/labels.json`, "utf8"));

async function toRaw(input: string | Buffer) {
  const { data, info } = await sharp(input).rotate().resize({ width: MAX_AI_DIMENSION, height: MAX_AI_DIMENSION, fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}

console.log(`Set "${SET}": ${labels.length} photos`);
console.log(`Model ${MODEL_ID} @ ${MODEL_VERSION} (${MODEL_DTYPE}); params`, params);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const classifier: any = await pipeline("zero-shot-image-classification", MODEL_ID, { revision: MODEL_REVISION, dtype: MODEL_DTYPE as "q8", device: "cpu" });

const pairs: Pair[] = [];
const t0 = Date.now();
const items: { file: string; kind: Kind; truth: string[]; image: () => Promise<RawImage> }[] = [];
for (const l of labels) {
  const path = `${DIR}/${l.file}`;
  items.push({ file: l.file, kind: l.kind, truth: l.truth, image: () => toRaw(path) });
  if (l.kind === "correct") {
    items.push({ file: `${l.file} (blurred)`, kind: "blurry", truth: l.truth, image: async () => toRaw(await sharp(path).resize({ width: 900, withoutEnlargement: true }).blur(18).jpeg().toBuffer()) });
  }
}
for (const it of items) {
  const image = await it.image();
  for (const m of MISSIONS) {
    const out = await classifier(image, m.candidateLabels, { hypothesis_template: "{}" });
    pairs.push({ file: it.file, kind: it.kind, mission: m.id, positive: it.truth.includes(m.id), scores: out.map((o: RankedLabel) => ({ label: o.label, score: o.score })) });
  }
  process.stdout.write(".");
}
console.log(`\n${pairs.length} photo×mission pairs in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const run = (p: VerifyParams) => pairs.map((x) => ({ ...x, outcome: verify(MISSIONS.find((m) => m.id === x.mission)!, x.scores, p).outcome as VerifyOutcome }));
const results = run(params);

function tally(kinds: Kind[]) {
  const rows = results.filter((r) => kinds.includes(r.kind));
  const pos = rows.filter((r) => r.positive);
  const neg = rows.filter((r) => !r.positive);
  const c = (rs: typeof rows, o: (x: VerifyOutcome) => boolean) => rs.filter((r) => o(r.outcome)).length;
  return {
    positives: pos.length,
    TP: c(pos, (o) => o === "matched"), uncertainPos: c(pos, (o) => o === "uncertain"), FN: c(pos, (o) => o === "mismatch" || o === "error"),
    negatives: neg.length,
    FP: c(neg, (o) => o === "matched"), uncertainNeg: c(neg, (o) => o === "uncertain"), TN: c(neg, (o) => o === "mismatch" || o === "error"),
  };
}

const sections = [
  ["Sharp photos (correct + unrelated)", ["correct", "unrelated"] as Kind[]],
  ["Correct photos only", ["correct"] as Kind[]],
  ["Unrelated indoor/street photos", ["unrelated"] as Kind[]],
  ["Blurred copies of correct photos", ["blurry"] as Kind[]],
] as const;
const summary = Object.fromEntries(sections.map(([n, k]) => [n, tally([...k])]));
console.table(summary);

const fp = results.filter((r) => r.kind !== "multi" && !r.positive && r.outcome === "matched");
const fn = results.filter((r) => r.kind === "correct" && r.positive && (r.outcome === "mismatch" || r.outcome === "error"));
const unc = results.filter((r) => r.kind === "correct" && r.positive && r.outcome === "uncertain");
const show = (r: (typeof results)[number]) => {
  const target = r.scores.find((s) => s.label === MISSIONS.find((m) => m.id === r.mission)!.targetLabel)!.score;
  const top = [...r.scores].sort((a, b) => b.score - a.score)[0];
  return `${r.file} vs ${r.mission}: target ${(target * 100).toFixed(0)}%, top "${top.label}" ${(top.score * 100).toFixed(0)}%`;
};
console.log("\nFalse positives (matched but should not):", fp.length ? "\n  " + fp.map(show).join("\n  ") : "none");
console.log("False negatives (clearly rejected a correct photo):", fn.length ? "\n  " + fn.map(show).join("\n  ") : "none");
console.log("Uncertain on correct photos:", unc.length ? "\n  " + unc.map(show).join("\n  ") : "none");

const multi = results.filter((r) => r.kind === "multi" && r.outcome === "matched");
console.log("\nBusy scenes (ambiguous, not counted): matched pairs", multi.map((r) => `${r.file}→${r.mission}`).join(", ") || "none");

if (args.includes("--sweep")) {
  console.log("\nThreshold sweep on sharp photos (FP = false positives, FN = clear rejections of correct photos, U = uncertain correct):");
  const rows = [];
  for (const minScore of [0.3, 0.4, 0.45, 0.5, 0.6, 0.7]) for (const minMargin of [0.05, 0.15, 0.25, 0.35]) {
    const rs = run({ ...params, minScore, minMargin }).filter((r) => r.kind === "correct" || r.kind === "unrelated");
    rows.push({ minScore, minMargin, FP: rs.filter((r) => !r.positive && r.outcome === "matched").length, FN: rs.filter((r) => r.positive && (r.outcome === "mismatch" || r.outcome === "error")).length, U: rs.filter((r) => r.positive && r.outcome === "uncertain").length, TP: rs.filter((r) => r.positive && r.outcome === "matched").length });
  }
  console.table(rows);
}

mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/${SET}.json`, JSON.stringify({ set: SET, model: MODEL_ID, version: MODEL_VERSION, params, photos: labels.length, summary, falsePositives: fp.map(show), falseNegatives: fn.map(show), uncertainCorrect: unc.map(show) }, null, 2));
console.log(`\nSaved eval/results/${SET}.json`);
