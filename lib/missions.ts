import type { AdventureMode, AdventureModeId, Mission } from "./types";

/** Shared negatives so "not nature at all" is always something the model can pick. */
const COMMON_NEGATIVES = [
  "a photo of a building",
  "a photo of a person",
  "a photo of an indoor room",
  "a photo of a car on a road",
];

function mission(m: Omit<Mission, "candidateLabels" | "points" | "inDefaultPool"> & { negatives: string[]; points?: number; inDefaultPool?: boolean }): Mission {
  const { negatives, points = 20, inDefaultPool = true, ...rest } = m;
  return {
    ...rest,
    points,
    inDefaultPool,
    candidateLabels: [m.targetLabel, ...m.aliases, ...negatives, ...COMMON_NEGATIVES],
  };
}

/**
 * Mission catalogue. Every task is something found in a park or garden and none requires
 * approaching wildlife, entering roads, trespassing or touching unknown plants.
 */
const BASE_MISSIONS: Mission[] = [
  mission({
    id: "green-leaf",
    title: "Find a green leaf",
    description: "Hold one close so the veins and edges fill the frame.",
    category: "plant",
    emoji: "🍃",
    targetLabel: "a close-up photo of a green leaf",
    aliases: [],
    difficulty: "easy",
    safety: "Photograph it where it grows. There is no need to pick it.",
    negatives: ["a close-up photo of a colorful flower", "a photo of a tree trunk", "a photo of a rock", "a photo of grass"],
  }),
  mission({
    id: "flower",
    title: "Discover a flower",
    description: "Any blossom counts, wild or planted.",
    category: "plant",
    emoji: "🌸",
    targetLabel: "a close-up photo of a flower",
    aliases: [],
    difficulty: "medium",
    safety: "Look, don’t pick. Skip anything you don’t recognize rather than touching it.",
    negatives: ["a photo of green leaves", "a photo of grass", "a photo of a tree", "a photo of a rock"],
  }),
  mission({
    id: "tree-trunk",
    title: "Find a tree trunk",
    description: "Fill the frame with bark and texture.",
    category: "plant",
    emoji: "🌳",
    targetLabel: "a close-up photo of a tree trunk with bark",
    aliases: [],
    difficulty: "easy",
    negatives: ["a close-up photo of a green leaf", "a photo of a wooden fence", "a photo of a flower", "a photo of a blue sky"],
  }),
  mission({
    id: "sky",
    title: "Photograph the sky",
    description: "Look up. Clouds, color or clear blue all count.",
    category: "sky",
    emoji: "☁️",
    targetLabel: "a photo of the sky with clouds",
    aliases: ["a photo of a clear blue sky"],
    difficulty: "easy",
    safety: "Never look at the sun directly, and stop walking while you look up.",
    negatives: ["a photo of a ceiling", "a photo of tree branches", "a photo of the ground", "a photo of the sea"],
  }),
  mission({
    id: "grass",
    title: "Find grass",
    description: "Crouch down and photograph a patch of grass.",
    category: "ground",
    emoji: "🌱",
    targetLabel: "a close-up photo of green grass",
    aliases: [],
    difficulty: "easy",
    negatives: ["a close-up photo of a green leaf", "a photo of dry soil", "a photo of a paved path", "a photo of a carpet"],
  }),
  mission({
    id: "rock",
    title: "Find a rock",
    description: "A pebble, a boulder, a stone: anything natural.",
    category: "ground",
    emoji: "🪨",
    targetLabel: "a photo of a rock or stone on the ground",
    aliases: [],
    difficulty: "medium",
    safety: "Don’t climb on or move rocks. Photograph them where they are.",
    negatives: ["a photo of a concrete wall", "a photo of dry soil", "a photo of a paved path", "a photo of grass"],
  }),
  mission({
    id: "fallen-leaf",
    title: "Find a fallen leaf",
    description: "Brown, yellow or red: a leaf that has dropped.",
    category: "plant",
    emoji: "🍂",
    targetLabel: "a photo of a dry fallen leaf on the ground",
    aliases: [],
    difficulty: "medium",
    negatives: ["a close-up photo of a green leaf", "a photo of dry soil", "a photo of a paved path", "a photo of a tree trunk"],
  }),
];

/**
 * Every mission also competes against the *other* missions' targets. A rock close-up has to look
 * more like "a rock" than like "tree bark" or "grass", which is the confusion we measured
 * (docs/EVALUATION.md). Curated look-alikes and shared negatives stay in the list too.
 */
export const MISSIONS: Mission[] = BASE_MISSIONS.map((m) => {
  const own = new Set([m.targetLabel, ...m.aliases]);
  const rivals = BASE_MISSIONS.filter((o) => o.id !== m.id).flatMap((o) => [o.targetLabel, ...o.aliases]).filter((l) => !own.has(l));
  return { ...m, candidateLabels: [...new Set([...m.candidateLabels, ...rivals])] };
});

export const ADVENTURE_MODES: AdventureMode[] = [
  { id: "quick", title: "Quick Escape", tagline: "Three easy finds. Just step outside.", missionCount: 3, minutes: "About 5 min", maxDifficulty: "easy" },
  { id: "explorer", title: "Nature Explorer", tagline: "Five discoveries on a relaxed walk.", missionCount: 5, minutes: "About 10 min", maxDifficulty: "medium" },
  { id: "deep", title: "Deep Discovery", tagline: "Seven finds for a proper wander.", missionCount: 7, minutes: "15–20 min", maxDifficulty: "medium" },
];

export const getMode = (id: string) => ADVENTURE_MODES.find((m) => m.id === id);
export const getMission = (id: string) => MISSIONS.find((m) => m.id === id);
export const missionsById = (list: Mission[] = MISSIONS) => new Map(list.map((m) => [m.id, m]));

/** Fisher–Yates with an injectable RNG so selection is testable. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draws the missions for an adventure. The mode's difficulty ceiling applies; if the pool
 * is too small for the requested count, harder missions fill the gap so a mode is never short.
 */
export function generateMissions(modeId: AdventureModeId, rng: () => number = Math.random, pool: Mission[] = MISSIONS): Mission[] {
  const mode = getMode(modeId);
  if (!mode) throw new Error(`Unknown adventure mode: ${modeId}`);
  const available = pool.filter((m) => m.inDefaultPool);
  const allowed = available.filter((m) => mode.maxDifficulty === "medium" || m.difficulty === "easy");
  const picked = shuffle(allowed, rng).slice(0, mode.missionCount);
  if (picked.length < mode.missionCount) {
    const rest = shuffle(available.filter((m) => !picked.includes(m)), rng);
    picked.push(...rest.slice(0, mode.missionCount - picked.length));
  }
  return picked;
}
