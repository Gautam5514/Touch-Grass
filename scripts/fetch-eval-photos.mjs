// Downloads the curated evaluation photos listed in eval/<set>-sources.json (node scripts/fetch-eval-photos.mjs dev|heldout) from Wikimedia Commons
// (hand-picked after visual review) and writes eval/dataset/labels.json + CREDITS.md.
//   kind "correct"   : main subject satisfies the missions in `truth`
//   kind "unrelated" : indoor/street scenes, should satisfy no mission
//   kind "multi"     : busy outdoor scenes (trees+grass+sky...); ambiguous, reported separately
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UA = { "User-Agent": "WildQuestEval/1.0 (hackathon evaluation)" };
const set = process.argv[2] ?? "dev"; // "dev" (used while designing prompts) or "heldout" (never tuned on)
const OUT = `eval/${set}`;
const sources = JSON.parse(readFileSync(`eval/${set}-sources.json`, "utf8"));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h = "") => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function info(title) {
  for (let a = 0; a < 6; a++) {
    await sleep(1200 + a * 2500);
    const u = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", action: "query", titles: title, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: 900 });
    const t = await (await fetch(u, { headers: UA })).text();
    try { return Object.values(JSON.parse(t).query.pages)[0].imageinfo[0]; } catch { /* rate limited: retry */ }
  }
  throw new Error(`No info for ${title}`);
}

const labels = [];
const credits = [];
for (const s of sources) {
  const ii = await info(s.title);
  await sleep(500);
  const r = await fetch(ii.thumburl, { headers: UA });
  if (!r.ok) throw new Error(`Download failed for ${s.title}: ${r.status}`);
  writeFileSync(`${OUT}/${s.file}`, Buffer.from(await r.arrayBuffer()));
  labels.push({ file: s.file, kind: s.kind, truth: s.truth, source: s.title });
  credits.push(`- ${s.file}: "${s.title.replace("File:", "")}", ${strip(ii.extmetadata?.Artist?.value) || "unknown author"}, ${ii.extmetadata?.LicenseShortName?.value ?? "see source"}. ${ii.descriptionurl}`);
  console.log("saved", s.file);
}
writeFileSync(`${OUT}/labels.json`, JSON.stringify(labels, null, 2));
writeFileSync(`${OUT}/CREDITS.md`, `# Evaluation photo credits\n\nPhotos from Wikimedia Commons, used only to test WildQuest AI. Each keeps its own license (listed below).\n\n${credits.join("\n")}\n`);
console.log(`${labels.length} photos`);
