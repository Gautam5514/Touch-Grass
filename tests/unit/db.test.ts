import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import * as store from "@/lib/db";
import { generateMissions } from "@/lib/missions";
import { toStorageError } from "@/lib/db";

const blob = () => new Blob(["x"], { type: "image/jpeg" });
const input = { thumbnail: blob(), image: blob(), predictedLabel: "a close-up photo of a green leaf", score: 0.9, margin: 0.8, modelId: "m", modelVersion: "v" };
let n = 0;

async function newSession(mode: "quick" | "explorer" | "deep" = "quick") {
  const missions = generateMissions(mode, () => 0.3);
  const id = await store.startSession(mode, missions);
  const loaded = (await store.loadSession(id))!;
  return { id, missions, items: loaded.items };
}

beforeEach(() => {
  store.useDatabase(`wq-test-${n++}`);
});

describe("session creation", () => {
  it("creates an active adventure with pending missions and stores mission snapshots", async () => {
    const { id, missions, items } = await newSession("explorer");
    const s = (await store.loadSession(id))!;
    expect(s.adventure).toMatchObject({ mode: "explorer", status: "active", pointsEarned: 0 });
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.status === "pending")).toBe(true);
    expect(s.defs.map((d) => d.id).sort()).toEqual(missions.map((m) => m.id).sort());
    expect((await store.getActiveAdventure())?.id).toBe(id);
  });
});

describe("matching and duplicate protection", () => {
  it("records a match once: discovery, status and points are written together", async () => {
    const { id, items } = await newSession();
    const sm = items[0].id!;
    expect(await store.beginAnalysis(sm)).toBe(true);
    expect(await store.recordMatch(sm, input)).toEqual({ saved: true });
    const s = (await store.loadSession(id))!;
    expect(s.items.find((i) => i.id === sm)?.status).toBe("matched");
    expect(s.discoveries).toHaveLength(1);
    expect(s.discoveries[0]).toMatchObject({ source: "ai", verificationStatus: "matched" });
    expect(s.adventure.pointsEarned).toBe(20);
  });

  it("ignores a repeated AI response (no double points or discoveries)", async () => {
    const { id, items } = await newSession();
    const sm = items[0].id!;
    await store.beginAnalysis(sm);
    const results = await Promise.all([store.recordMatch(sm, input), store.recordMatch(sm, input), store.recordMatch(sm, input)]);
    expect(results.filter((r) => r.saved)).toHaveLength(1);
    const s = (await store.loadSession(id))!;
    expect(s.discoveries).toHaveLength(1);
    expect(s.adventure.pointsEarned).toBe(20);
  });

  it("rejects a match that wasn't analyzing, and a double-tapped analysis start", async () => {
    const { items } = await newSession();
    const sm = items[0].id!;
    expect(await store.recordMatch(sm, input)).toEqual({ saved: false });
    const starts = await Promise.all([store.beginAnalysis(sm), store.beginAnalysis(sm)]);
    expect(starts.filter(Boolean)).toHaveLength(1);
  });

  it("an uncertain result returns the mission to pending without a discovery", async () => {
    const { id, items } = await newSession();
    const sm = items[0].id!;
    await store.beginAnalysis(sm);
    await store.revertAnalysis(sm);
    const s = (await store.loadSession(id))!;
    expect(s.items.find((i) => i.id === sm)?.status).toBe("pending");
    expect(s.discoveries).toHaveLength(0);
  });
});

describe("manual and skipped", () => {
  it("manual logs are stored as manual and earn no points", async () => {
    const { id, items } = await newSession();
    await store.recordManual(items[0].id!, { thumbnail: blob() });
    const s = (await store.loadSession(id))!;
    expect(s.discoveries[0]).toMatchObject({ source: "manual", verificationStatus: "manual" });
    expect(s.adventure.pointsEarned).toBe(0);
  });

  it("cannot manually log a resolved mission twice", async () => {
    const { items } = await newSession();
    const sm = items[0].id!;
    expect((await store.recordManual(sm, { thumbnail: blob() })).saved).toBe(true);
    expect((await store.recordManual(sm, { thumbnail: blob() })).saved).toBe(false);
  });

  it("skipping awards nothing and can be undone", async () => {
    const { id, items } = await newSession();
    const sm = items[0].id!;
    await store.skipMission(sm);
    expect((await store.loadSession(id))!.items[0].status).toBe("skipped");
    await store.unskipMission(sm);
    expect((await store.loadSession(id))!.items[0].status).toBe("pending");
  });

  it("a matched mission can't be skipped afterwards", async () => {
    const { id, items } = await newSession();
    const sm = items[0].id!;
    await store.beginAnalysis(sm);
    await store.recordMatch(sm, input);
    await store.skipMission(sm);
    expect((await store.loadSession(id))!.items.find((i) => i.id === sm)?.status).toBe("matched");
  });
});

describe("completion and refresh recovery", () => {
  it("won't complete with unresolved missions, then completes once all are resolved (skips allowed)", async () => {
    const { id, items } = await newSession();
    expect(await store.completeAdventure(id)).toBe(false);
    for (const i of items) await store.skipMission(i.id!);
    expect(await store.completeAdventure(id, 123_456)).toBe(true);
    const a = (await store.loadSession(id))!.adventure;
    expect(a).toMatchObject({ status: "completed", completedAt: 123_456, pointsEarned: 0 });
    expect(await store.getActiveAdventure()).toBeUndefined();
  });

  it("completing twice is harmless", async () => {
    const { id, items } = await newSession();
    for (const i of items) await store.skipMission(i.id!);
    await store.completeAdventure(id, 1);
    expect(await store.completeAdventure(id, 999)).toBe(true);
    expect((await store.loadSession(id))!.adventure.completedAt).toBe(1);
  });

  it("recovers missions stuck in analyzing after a refresh", async () => {
    const { id, items } = await newSession();
    await store.beginAnalysis(items[1].id!);
    await store.recoverStaleAnalysis(id);
    expect((await store.loadSession(id))!.items[1].status).toBe("pending");
  });

  it("returns null for an unknown adventure", async () => {
    expect(await store.loadSession(9999)).toBeNull();
  });
});

describe("deletion", () => {
  it("deletes one discovery without touching the rest", async () => {
    const { id, items } = await newSession();
    await store.recordManual(items[0].id!, { thumbnail: blob() });
    await store.recordManual(items[1].id!, { thumbnail: blob() });
    const [a] = (await store.loadSession(id))!.discoveries;
    await store.deleteDiscovery(a.id!);
    expect((await store.loadSession(id))!.discoveries).toHaveLength(1);
  });

  it("clearAllData empties every store including settings", async () => {
    const { items } = await newSession();
    await store.recordManual(items[0].id!, { thumbnail: blob() });
    await store.updateSettings({ locationEnabled: true });
    await store.clearAllData();
    expect(await store.db.adventures.count()).toBe(0);
    expect(await store.db.sessionMissions.count()).toBe(0);
    expect(await store.db.discoveries.count()).toBe(0);
    expect(await store.db.missions.count()).toBe(0);
    expect((await store.getSettings()).locationEnabled).toBe(false);
  });

  it("discardAdventure removes the adventure and its children", async () => {
    const { id, items } = await newSession();
    await store.recordManual(items[0].id!, { thumbnail: blob() });
    await store.discardAdventure(id);
    expect(await store.loadSession(id)).toBeNull();
    expect(await store.db.discoveries.count()).toBe(0);
  });
});

describe("settings and errors", () => {
  it("merges settings patches over defaults", async () => {
    expect((await store.getSettings()).onboardingCompleted).toBe(false);
    await store.updateSettings({ onboardingCompleted: true });
    await store.updateSettings({ offlineReady: true });
    expect(await store.getSettings()).toMatchObject({ onboardingCompleted: true, offlineReady: true });
  });

  it("maps quota and unavailable storage to actionable errors", () => {
    expect(toStorageError(Object.assign(new Error("x"), { name: "QuotaExceededError" })).code).toBe("quota");
    expect(toStorageError(Object.assign(new Error("x"), { name: "OpenFailedError" })).code).toBe("unavailable");
    expect(toStorageError(Object.assign(new Error("x"), { name: "MissingAPIError" })).code).toBe("unavailable");
    expect(toStorageError(new Error("weird")).code).toBe("unknown");
  });
});
