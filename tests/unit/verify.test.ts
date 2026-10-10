import { describe, expect, it } from "vitest";
import { verify } from "@/lib/ai/verify";
import { DEFAULT_VERIFY_PARAMS } from "@/lib/ai/config";
import { MISSIONS } from "@/lib/missions";
import type { Mission, RankedLabel } from "@/lib/types";

const sky = MISSIONS.find((m) => m.id === "sky")!; // has an alias
const leaf = MISSIONS.find((m) => m.id === "green-leaf")!;

/** Builds a normalised score list: given labels get the stated scores, the rest share the remainder. */
function scores(m: Mission, given: Record<string, number>): RankedLabel[] {
  const rest = m.candidateLabels.filter((l) => !(l in given));
  const left = Math.max(0, 1 - Object.values(given).reduce((a, b) => a + b, 0));
  return m.candidateLabels.map((label) => ({ label, score: label in given ? given[label] : left / Math.max(1, rest.length) }));
}

describe("verify: outcomes", () => {
  it("matched: target first, strong score, clear margin", () => {
    const r = verify(leaf, scores(leaf, { [leaf.targetLabel]: 0.9 }));
    expect(r.outcome).toBe("matched");
    expect(r.margin).toBeGreaterThan(DEFAULT_VERIFY_PARAMS.minMargin);
  });

  it("mismatch: another label clearly wins", () => {
    const r = verify(leaf, scores(leaf, { [leaf.targetLabel]: 0.02, "a photo of a building": 0.85 }));
    expect(r.outcome).toBe("mismatch");
    expect(r.topLabel).toBe("a photo of a building");
  });

  it("uncertain: target first but below the score bar", () => {
    const r = verify(leaf, scores(leaf, { [leaf.targetLabel]: 0.3, "a photo of a rock": 0.12 }));
    expect(r.outcome).toBe("uncertain");
    expect(r.reason).toMatch(/only at 30%/);
  });

  it("uncertain: target first but the margin is too thin", () => {
    const r = verify(leaf, scores(leaf, { [leaf.targetLabel]: 0.5, "a close-up photo of a colorful flower": 0.42 }));
    expect(r.outcome).toBe("uncertain");
    expect(r.reason).toMatch(/too close/);
  });

  it("uncertain: another label leads but not decisively", () => {
    const r = verify(leaf, scores(leaf, { [leaf.targetLabel]: 0.3, "a photo of a rock": 0.35 }));
    expect(r.outcome).toBe("uncertain");
  });

  it("is exactly at the thresholds: inclusive for score and margin", () => {
    const p = { minScore: 0.5, minMargin: 0.25, mismatchScore: 0.6 };
    const at = scores(leaf, { [leaf.targetLabel]: 0.5, "a photo of a rock": 0.25 });
    expect(verify(leaf, at, p).outcome).toBe("matched");
    const below = scores(leaf, { [leaf.targetLabel]: 0.49, "a photo of a rock": 0.24 });
    expect(verify(leaf, below, p).outcome).toBe("uncertain");
  });
});

describe("verify: aliases combine into the target group", () => {
  it("matches when target and alias split the score", () => {
    const r = verify(sky, scores(sky, { [sky.targetLabel]: 0.35, [sky.aliases[0]]: 0.3 }));
    expect(r.outcome).toBe("matched");
    expect(r.targetScore).toBeCloseTo(0.65);
  });

  it("matches when only the alias ranks first", () => {
    const r = verify(sky, scores(sky, { [sky.targetLabel]: 0.1, [sky.aliases[0]]: 0.8 }));
    expect(r.outcome).toBe("matched");
    expect(r.topLabel).toBe(sky.aliases[0]);
  });
});

describe("verify: invalid input", () => {
  it.each([
    ["empty output", []],
    ["NaN score", [{ label: "x", score: NaN }]],
    ["target missing", [{ label: "a photo of a building", score: 1 }]],
  ] as const)("returns error for %s", (_n, input) => {
    expect(verify(leaf, input as unknown as RankedLabel[]).outcome).toBe("error");
  });

  it("does not mutate its input", () => {
    const input = scores(leaf, { [leaf.targetLabel]: 0.9 });
    const copy = JSON.stringify(input);
    verify(leaf, input);
    expect(JSON.stringify(input)).toBe(copy);
  });
});
