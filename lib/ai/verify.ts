import type { Mission, RankedLabel, VerifyParams, VerifyResult } from "../types";
import { DEFAULT_VERIFY_PARAMS, MISSION_VERIFY_OVERRIDES } from "./config";

export const paramsFor = (missionId: string): VerifyParams => ({
  ...DEFAULT_VERIFY_PARAMS,
  ...MISSION_VERIFY_OVERRIDES[missionId],
});

const pct = (n: number) => `${Math.round(n * 100)}%`;
const plain = (l: string) => l.replace(/^an? (close-up )?photo of (an? |the )?/, "");

const blank = (ranked: RankedLabel[], reason: string): VerifyResult => ({
  outcome: "error",
  topLabel: ranked[0]?.label ?? "",
  topScore: ranked[0]?.score ?? 0,
  targetScore: 0,
  margin: 0,
  ranked,
  reason,
});

/**
 * Pure decision rule. CLIP scores are *relative* similarities across the prompts we supplied,
 * not the probability that the photo is truly correct, so the rule demands a clear win:
 *  1. the target (or an allowed alias) ranks first,
 *  2. its combined score clears `minScore`,
 *  3. it leads the best competing label by `minMargin`.
 * Anything short of that is "uncertain" rather than a guess; a clear win for a different
 * label is a "mismatch". Bad input yields "error".
 */
export function verify(mission: Mission, model: RankedLabel[], params: VerifyParams = paramsFor(mission.id)): VerifyResult {
  if (!Array.isArray(model) || model.length === 0) return blank([], "The model returned no scores.");
  if (model.some((r) => typeof r.score !== "number" || !Number.isFinite(r.score))) return blank([], "The model returned invalid scores.");

  const ranked = [...model].sort((a, b) => b.score - a.score);
  const allowed = new Set([mission.targetLabel, ...mission.aliases]);
  const allowedScored = ranked.filter((r) => allowed.has(r.label));
  if (allowedScored.length === 0) return blank(ranked, "The target description was missing from the model output.");

  const top = ranked[0];
  const targetScore = allowedScored.reduce((s, r) => s + r.score, 0);
  const competitors = ranked.filter((r) => !allowed.has(r.label));
  const bestCompetitor = competitors[0]?.score ?? 0;
  const margin = targetScore - bestCompetitor;
  const topIsTarget = allowed.has(top.label);

  const base = { topLabel: top.label, topScore: top.score, targetScore, margin, ranked };

  if (topIsTarget && targetScore >= params.minScore && margin >= params.minMargin) {
    return { ...base, outcome: "matched", reason: `This looks like your target (${pct(targetScore)} similarity), well ahead of the next closest idea.` };
  }
  if (!topIsTarget && competitors[0].score >= params.mismatchScore) {
    return { ...base, outcome: "mismatch", reason: `This looks more like ${plain(top.label)} (${pct(top.score)}) than your target (${pct(targetScore)}).` };
  }
  if (!topIsTarget) {
    return { ...base, outcome: "uncertain", reason: `The model isn’t sure. ${plain(top.label)} scored slightly higher than your target.` };
  }
  if (targetScore < params.minScore) {
    return { ...base, outcome: "uncertain", reason: `Your target ranked first but only at ${pct(targetScore)}. A closer, brighter shot may help.` };
  }
  return { ...base, outcome: "uncertain", reason: `Your target led by just ${pct(margin)}, too close to ${plain(competitors[0].label)} to be sure.` };
}
