import type { Adventure, AdventureSummary, Mission, SessionMission, SessionMissionStatus } from "./types";

/** Allowed mission state transitions. Terminal states (matched, manual) never change. */
const TRANSITIONS: Record<SessionMissionStatus, SessionMissionStatus[]> = {
  pending: ["analyzing", "manual", "skipped"],
  analyzing: ["matched", "pending"],
  matched: [],
  manual: [],
  skipped: ["pending"], // changed your mind
};

export const canTransition = (from: SessionMissionStatus, to: SessionMissionStatus) => TRANSITIONS[from].includes(to);

export const isResolved = (s: SessionMissionStatus) => s === "matched" || s === "manual" || s === "skipped";

/** Only AI-matched missions earn points, and each mission at most once. */
export function computePoints(items: Pick<SessionMission, "missionId" | "status">[], missions: Map<string, Pick<Mission, "points">>): number {
  const seen = new Set<string>();
  let total = 0;
  for (const it of items) {
    if (it.status !== "matched" || seen.has(it.missionId)) continue;
    seen.add(it.missionId);
    total += missions.get(it.missionId)?.points ?? 0;
  }
  return total;
}

export function badgeFor(s: Pick<AdventureSummary, "total" | "matched" | "manual" | "skipped">): AdventureSummary["badge"] {
  if (s.total > 0 && s.matched === s.total) return { id: "ranger", name: "Sharp-Eyed Ranger", emoji: "🦉", blurb: "Every discovery verified by AI." };
  if (s.matched + s.manual >= Math.ceil(s.total / 2) && s.matched + s.manual > 0) return { id: "explorer", name: "Trail Explorer", emoji: "🧭", blurb: "You found most of what you set out to." };
  return { id: "wanderer", name: "Wanderer", emoji: "🥾", blurb: "You stepped outside. That’s the whole point." };
}

export function summarize(adventure: Pick<Adventure, "startedAt" | "completedAt">, items: Pick<SessionMission, "missionId" | "status">[], missions: Map<string, Pick<Mission, "points">>): AdventureSummary {
  const count = (st: SessionMissionStatus) => items.filter((i) => i.status === st).length;
  const matched = count("matched");
  const manual = count("manual");
  const skipped = count("skipped");
  const pending = count("pending") + count("analyzing");
  const base = { total: items.length, matched, manual, skipped };
  return {
    ...base,
    pending,
    resolved: matched + manual + skipped,
    points: computePoints(items, missions),
    maxPoints: items.reduce((n, i) => n + (missions.get(i.missionId)?.points ?? 0), 0),
    durationMs: adventure.completedAt ? Math.max(0, adventure.completedAt - adventure.startedAt) : null,
    badge: badgeFor(base),
  };
}

export const formatDuration = (ms: number | null) => {
  if (ms === null) return "In progress";
  const m = Math.round(ms / 60000);
  return m < 1 ? "Under a minute" : m === 1 ? "1 minute" : `${m} minutes`;
};
