import Dexie, { type EntityTable } from "dexie";
import { MODEL_ID, MODEL_VERSION } from "./ai/config";
import { computePoints, canTransition, isResolved } from "./session";
import type { Adventure, AdventureModeId, AppSettings, Discovery, Mission, MissionDefinitionRow, SessionMission } from "./types";

class WildQuestDB extends Dexie {
  adventures!: EntityTable<Adventure, "id">;
  missions!: EntityTable<MissionDefinitionRow, "id">;
  sessionMissions!: EntityTable<SessionMission, "id">;
  discoveries!: EntityTable<Discovery, "id">;
  appSettings!: EntityTable<AppSettings, "id">;

  constructor(name = "wildquest") {
    super(name);
    // v1: first prototype (single flat adventure/discovery shape).
    this.version(1).stores({
      adventures: "++id, status, startedAt",
      discoveries: "++id, adventureId, missionId, verifiedAt",
      settings: "key",
    });
    // v2: sessions with per-mission state, mission snapshots and typed settings.
    // The prototype's rows have an incompatible shape, so they are cleared on upgrade.
    this.version(2)
      .stores({
        adventures: "++id, status, createdAt",
        missions: "id",
        sessionMissions: "++id, adventureId, [adventureId+missionId], status",
        discoveries: "++id, adventureId, sessionMissionId, capturedAt",
        appSettings: "id",
        settings: null,
      })
      .upgrade(async (tx) => {
        await tx.table("adventures").clear();
        await tx.table("discoveries").clear();
      });
  }
}

export let db = new WildQuestDB();

/** Test seam: point the module at an isolated database. */
export function useDatabase(name: string) {
  db = new WildQuestDB(name);
  return db;
}

export class StorageError extends Error {
  constructor(message: string, readonly code: "quota" | "unavailable" | "unknown") {
    super(message);
  }
}

/** Maps IndexedDB failures to messages a person can act on. */
export function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string })?.name ?? "";
  if (name === "QuotaExceededError" || /quota/i.test(String((e as Error)?.message))) {
    return new StorageError("Your device is out of storage for WildQuest. Delete some journal photos in Settings and try again.", "quota");
  }
  if (["OpenFailedError", "MissingAPIError", "SecurityError", "InvalidStateError", "UnknownError"].includes(name)) {
    return new StorageError("Saving isn’t available in this browser (private browsing or blocked storage).", "unavailable");
  }
  return new StorageError("Something went wrong saving your progress. Please try again.", "unknown");
}

export async function checkStorage(): Promise<StorageError | null> {
  try {
    await db.open();
    return null;
  } catch (e) {
    return toStorageError(e);
  }
}

// ---------- settings ----------
export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  offlineReady: false,
  modelId: MODEL_ID,
  modelVersion: MODEL_VERSION,
  locationEnabled: false,
  onboardingCompleted: false,
};

export async function getSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...(await db.appSettings.get("app")) };
}

export async function updateSettings(patch: Partial<Omit<AppSettings, "id">>) {
  await db.transaction("rw", db.appSettings, async () => {
    const cur = await getSettings();
    await db.appSettings.put({ ...cur, ...patch, id: "app" });
  });
}

// ---------- sessions ----------
export async function startSession(mode: AdventureModeId, missions: Mission[], now = Date.now()): Promise<number> {
  try {
    return await db.transaction("rw", db.adventures, db.missions, db.sessionMissions, async () => {
      await db.missions.bulkPut(
        missions.map((m) => ({ id: m.id, title: m.title, targetLabel: m.targetLabel, candidateLabels: m.candidateLabels, points: m.points })),
      );
      const id = (await db.adventures.add({ mode, status: "active", createdAt: now, startedAt: now, pointsEarned: 0 })) as number;
      await db.sessionMissions.bulkAdd(missions.map((m) => ({ adventureId: id, missionId: m.id, status: "pending" as const })));
      return id;
    });
  } catch (e) {
    throw toStorageError(e);
  }
}

export async function getActiveAdventure() {
  return db.adventures.where("status").equals("active").last();
}

/** After a refresh mid-analysis nothing is running any more, so analysing missions go back to pending. */
export async function recoverStaleAnalysis(adventureId: number) {
  await db.sessionMissions.where({ adventureId }).filter((s) => s.status === "analyzing").modify({ status: "pending" });
}

async function pointsFor(adventureId: number) {
  const items = await db.sessionMissions.where({ adventureId }).toArray();
  const defs = await db.missions.toArray();
  return computePoints(items, new Map(defs.map((d) => [d.id, d])));
}

/** pending → analyzing. Returns false if the mission isn't pending (e.g. a double tap). */
export async function beginAnalysis(sessionMissionId: number): Promise<boolean> {
  return db.transaction("rw", db.sessionMissions, async () => {
    const s = await db.sessionMissions.get(sessionMissionId);
    if (!s || !canTransition(s.status, "analyzing")) return false;
    await db.sessionMissions.update(sessionMissionId, { status: "analyzing" });
    return true;
  });
}

/** analyzing → pending (uncertain result, error, or the user left the page). */
export async function revertAnalysis(sessionMissionId: number) {
  await db.transaction("rw", db.sessionMissions, async () => {
    const s = await db.sessionMissions.get(sessionMissionId);
    if (s && canTransition(s.status, "pending") && s.status === "analyzing") await db.sessionMissions.update(sessionMissionId, { status: "pending" });
  });
}

type DiscoveryInput = Omit<Discovery, "id" | "adventureId" | "sessionMissionId" | "capturedAt" | "source" | "verificationStatus">;

/**
 * Writes the discovery and the mission status together. Idempotent: a repeated AI response or a
 * double tap finds the mission already resolved and changes nothing.
 */
export async function recordMatch(sessionMissionId: number, input: DiscoveryInput, now = Date.now()): Promise<{ saved: boolean }> {
  try {
    return await db.transaction("rw", db.sessionMissions, db.discoveries, db.adventures, db.missions, async () => {
      const s = await db.sessionMissions.get(sessionMissionId);
      if (!s || s.status !== "analyzing") return { saved: false };
      await db.discoveries.add({ ...input, adventureId: s.adventureId, sessionMissionId, capturedAt: now, source: "ai", verificationStatus: "matched" });
      await db.sessionMissions.update(sessionMissionId, { status: "matched", completedAt: now });
      await db.adventures.update(s.adventureId, { pointsEarned: await pointsFor(s.adventureId) });
      return { saved: true };
    });
  } catch (e) {
    throw toStorageError(e);
  }
}

/** Manual log: stored as manual, never earns AI-verified points. */
export async function recordManual(sessionMissionId: number, input: Pick<DiscoveryInput, "thumbnail" | "image" | "approximateLocation">, now = Date.now()): Promise<{ saved: boolean }> {
  try {
    return await db.transaction("rw", db.sessionMissions, db.discoveries, async () => {
      const s = await db.sessionMissions.get(sessionMissionId);
      if (!s || !canTransition(s.status, "manual")) return { saved: false };
      await db.discoveries.add({ ...input, adventureId: s.adventureId, sessionMissionId, capturedAt: now, source: "manual", verificationStatus: "manual" });
      await db.sessionMissions.update(sessionMissionId, { status: "manual", completedAt: now });
      return { saved: true };
    });
  } catch (e) {
    throw toStorageError(e);
  }
}

export async function skipMission(sessionMissionId: number, now = Date.now()) {
  await db.transaction("rw", db.sessionMissions, async () => {
    const s = await db.sessionMissions.get(sessionMissionId);
    if (s && canTransition(s.status, "skipped")) await db.sessionMissions.update(sessionMissionId, { status: "skipped", completedAt: now });
  });
}

export async function unskipMission(sessionMissionId: number) {
  await db.transaction("rw", db.sessionMissions, async () => {
    const s = await db.sessionMissions.get(sessionMissionId);
    if (s?.status === "skipped") await db.sessionMissions.update(sessionMissionId, { status: "pending", completedAt: undefined });
  });
}

/** Completion needs every mission resolved (skips count). Returns false otherwise. */
export async function completeAdventure(adventureId: number, now = Date.now()): Promise<boolean> {
  return db.transaction("rw", db.adventures, db.sessionMissions, db.missions, async () => {
    const adv = await db.adventures.get(adventureId);
    if (!adv) return false;
    if (adv.status === "completed") return true;
    const items = await db.sessionMissions.where({ adventureId }).toArray();
    if (items.length === 0 || !items.every((i) => isResolved(i.status))) return false;
    await db.adventures.update(adventureId, { status: "completed", completedAt: now, pointsEarned: await pointsFor(adventureId) });
    return true;
  });
}

/** Abandons an unfinished adventure and everything saved for it. */
export async function discardAdventure(adventureId: number) {
  await db.transaction("rw", db.adventures, db.sessionMissions, db.discoveries, async () => {
    await db.discoveries.where({ adventureId }).delete();
    await db.sessionMissions.where({ adventureId }).delete();
    await db.adventures.delete(adventureId);
  });
}

export async function loadSession(adventureId: number) {
  const adventure = await db.adventures.get(adventureId);
  if (!adventure) return null;
  const [items, discoveries, defs] = await Promise.all([
    db.sessionMissions.where({ adventureId }).toArray(),
    db.discoveries.where({ adventureId }).toArray(),
    db.missions.toArray(),
  ]);
  return { adventure, items, discoveries, defs };
}

export const defsMap = (defs: MissionDefinitionRow[]) => new Map(defs.map((d) => [d.id, d]));

// ---------- journal & data management ----------
export async function deleteDiscovery(id: number) {
  await db.discoveries.delete(id);
}

/** Deletes every adventure, photo and setting. Model files and offline cache are separate. */
export async function clearAllData() {
  await db.transaction("rw", [db.adventures, db.missions, db.sessionMissions, db.discoveries, db.appSettings], async () => {
    await Promise.all([db.adventures.clear(), db.missions.clear(), db.sessionMissions.clear(), db.discoveries.clear(), db.appSettings.clear()]);
  });
}
