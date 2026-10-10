import { describe, expect, it } from "vitest";
import { badgeFor, canTransition, computePoints, formatDuration, isResolved, summarize } from "@/lib/session";
import { MISSIONS, missionsById } from "@/lib/missions";
import type { SessionMissionStatus as S } from "@/lib/types";

const defs = missionsById();
const item = (missionId: string, status: S) => ({ missionId, status });

describe("state machine", () => {
  const all: S[] = ["pending", "analyzing", "matched", "manual", "skipped"];
  const allowed: [S, S][] = [
    ["pending", "analyzing"], ["pending", "manual"], ["pending", "skipped"],
    ["analyzing", "matched"], ["analyzing", "pending"], ["skipped", "pending"],
  ];
  it("allows exactly the documented transitions", () => {
    for (const a of all) for (const b of all) expect(canTransition(a, b)).toBe(allowed.some(([x, y]) => x === a && y === b));
  });
  it("matched and manual are terminal", () => {
    for (const t of all) { expect(canTransition("matched", t)).toBe(false); expect(canTransition("manual", t)).toBe(false); }
  });
  it("resolved = matched, manual or skipped", () => {
    expect(all.filter(isResolved)).toEqual(["matched", "manual", "skipped"]);
  });
});

describe("points", () => {
  it("awards 20 per AI match only", () => {
    const items = [item("green-leaf", "matched"), item("flower", "manual"), item("sky", "skipped"), item("grass", "pending"), item("rock", "analyzing")];
    expect(computePoints(items, defs)).toBe(20);
  });
  it("a full five-mission match scores 100", () => {
    expect(computePoints(MISSIONS.slice(0, 5).map((m) => item(m.id, "matched")), defs)).toBe(100);
  });
  it("never counts the same mission twice", () => {
    expect(computePoints([item("sky", "matched"), item("sky", "matched")], defs)).toBe(20);
  });
  it("ignores unknown missions", () => {
    expect(computePoints([item("nope", "matched")], defs)).toBe(0);
  });
});

describe("summary", () => {
  const adv = { startedAt: 1_000, completedAt: 1_000 + 7 * 60_000 };
  it("counts each status separately and reports points", () => {
    const s = summarize(adv, [item("green-leaf", "matched"), item("flower", "matched"), item("sky", "manual"), item("grass", "skipped"), item("rock", "skipped")], defs);
    expect(s).toMatchObject({ total: 5, matched: 2, manual: 1, skipped: 2, pending: 0, resolved: 5, points: 40, maxPoints: 100 });
    expect(s.durationMs).toBe(7 * 60_000);
  });
  it("does not inflate matched when missions were skipped", () => {
    const s = summarize(adv, [item("sky", "skipped"), item("grass", "skipped"), item("rock", "skipped")], defs);
    expect(s.matched).toBe(0);
    expect(s.points).toBe(0);
  });
  it("reports pending and unknown duration for an unfinished adventure", () => {
    const s = summarize({ startedAt: 5 }, [item("sky", "pending"), item("rock", "analyzing")], defs);
    expect(s.pending).toBe(2);
    expect(s.durationMs).toBeNull();
    expect(formatDuration(null)).toBe("In progress");
  });
  it("picks badges honestly", () => {
    expect(badgeFor({ total: 3, matched: 3, manual: 0, skipped: 0 }).id).toBe("ranger");
    expect(badgeFor({ total: 4, matched: 1, manual: 1, skipped: 2 }).id).toBe("explorer");
    expect(badgeFor({ total: 4, matched: 0, manual: 0, skipped: 4 }).id).toBe("wanderer");
  });
  it("formats durations", () => {
    expect(formatDuration(20_000)).toBe("Under a minute");
    expect(formatDuration(60_000)).toBe("1 minute");
    expect(formatDuration(9 * 60_000)).toBe("9 minutes");
  });
});
