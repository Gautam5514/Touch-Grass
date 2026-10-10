import { describe, expect, it } from "vitest";
import { ADVENTURE_MODES, generateMissions, MISSIONS, shuffle } from "@/lib/missions";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe("mission catalogue", () => {
  it("has the seven required missions with complete definitions", () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(["green-leaf", "flower", "tree-trunk", "sky", "grass", "rock", "fallen-leaf"]);
    for (const m of MISSIONS) {
      expect(m.title && m.description && m.emoji && m.targetLabel).toBeTruthy();
      expect(m.points).toBe(20);
      expect(m.candidateLabels).toContain(m.targetLabel);
      for (const a of m.aliases) expect(m.candidateLabels).toContain(a);
      expect(new Set(m.candidateLabels).size).toBe(m.candidateLabels.length);
      expect(m.candidateLabels.length).toBeGreaterThanOrEqual(6); // real negatives to choose from
    }
  });

  it("flags safety messages for the missions that need them", () => {
    for (const id of ["sky", "rock", "flower"]) expect(MISSIONS.find((m) => m.id === id)?.safety).toBeTruthy();
  });
});

describe("generateMissions", () => {
  it.each(ADVENTURE_MODES)("$id draws exactly $missionCount unique missions", (mode) => {
    const picked = generateMissions(mode.id, seeded(7));
    expect(picked).toHaveLength(mode.missionCount);
    expect(new Set(picked.map((m) => m.id)).size).toBe(mode.missionCount);
  });

  it("Quick Escape only draws easy missions", () => {
    for (let s = 1; s <= 30; s++) expect(generateMissions("quick", seeded(s)).every((m) => m.difficulty === "easy")).toBe(true);
  });

  it("Deep Discovery uses the whole pool", () => {
    expect(new Set(generateMissions("deep", seeded(3)).map((m) => m.id))).toEqual(new Set(MISSIONS.map((m) => m.id)));
  });

  it("is deterministic for a given RNG and varies across seeds", () => {
    expect(generateMissions("explorer", seeded(5)).map((m) => m.id)).toEqual(generateMissions("explorer", seeded(5)).map((m) => m.id));
    const variants = new Set(Array.from({ length: 20 }, (_, i) => generateMissions("explorer", seeded(i + 1)).map((m) => m.id).join()));
    expect(variants.size).toBeGreaterThan(1);
  });

  it("respects inDefaultPool and rejects unknown modes", () => {
    const pool = MISSIONS.map((m, i) => ({ ...m, inDefaultPool: i !== 0 }));
    expect(generateMissions("deep", seeded(1), pool).some((m) => m.id === MISSIONS[0].id)).toBe(false);
    // @ts-expect-error invalid mode on purpose
    expect(() => generateMissions("nope")).toThrow();
  });

  it("shuffle keeps all items", () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(9)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
