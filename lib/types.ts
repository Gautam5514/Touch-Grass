// ---------- Missions ----------
export type MissionCategory = "plant" | "ground" | "sky";
export type Difficulty = "easy" | "medium";
export type AdventureModeId = "quick" | "explorer" | "deep";

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  emoji: string;
  /** CLIP text prompt that means "success". */
  targetLabel: string;
  /** Other prompts that also count as success (synonyms/near-identical views). */
  aliases: string[];
  /** Every prompt scored by the model: target + aliases + negatives. */
  candidateLabels: string[];
  points: number;
  difficulty: Difficulty;
  safety?: string;
  inDefaultPool: boolean;
}

export interface AdventureMode {
  id: AdventureModeId;
  title: string;
  tagline: string;
  missionCount: number;
  minutes: string;
  /** Hardest difficulty allowed when drawing missions. */
  maxDifficulty: Difficulty;
}

// ---------- AI ----------
export interface RankedLabel {
  label: string;
  score: number;
}

export interface VerifyParams {
  /** Minimum combined score of target + aliases. */
  minScore: number;
  /** Minimum gap between the target group and the best competing label. */
  minMargin: number;
  /** A different label must beat this score (while the target is low) to call it a clear mismatch. */
  mismatchScore: number;
}

export type VerifyOutcome = "matched" | "uncertain" | "mismatch" | "error";

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** Highest-ranked label overall. */
  topLabel: string;
  topScore: number;
  /** Combined relative score of the target and its aliases. */
  targetScore: number;
  /** targetScore minus best competing label (can be negative). */
  margin: number;
  ranked: RankedLabel[];
  reason: string;
}

export interface AiResultMeta {
  modelId: string;
  modelVersion: string;
  inferenceMs: number;
}

// ---------- Session / persistence ----------
export type SessionMissionStatus = "pending" | "analyzing" | "matched" | "manual" | "skipped";
export type AdventureStatus = "active" | "completed";

export interface Adventure {
  id?: number;
  mode: AdventureModeId;
  status: AdventureStatus;
  createdAt: number;
  startedAt: number;
  completedAt?: number;
  pointsEarned: number;
}

export interface MissionDefinitionRow {
  id: string;
  title: string;
  targetLabel: string;
  candidateLabels: string[];
  points: number;
}

export interface SessionMission {
  id?: number;
  adventureId: number;
  missionId: string;
  status: SessionMissionStatus;
  completedAt?: number;
}

export type DiscoverySource = "ai" | "manual";
export type VerificationStatus = "matched" | "manual";

export interface Discovery {
  id?: number;
  adventureId: number;
  sessionMissionId: number;
  capturedAt: number;
  source: DiscoverySource;
  thumbnail: Blob;
  image?: Blob;
  verificationStatus: VerificationStatus;
  predictedLabel?: string;
  score?: number;
  margin?: number;
  modelId?: string;
  modelVersion?: string;
  /** Rounded to ~1 km, stored only if the user turned location on. */
  approximateLocation?: { lat: number; lon: number };
}

export interface AppSettings {
  id: "app";
  offlineReady: boolean;
  /** When the offline self-test last passed (ms epoch). */
  offlineVerifiedAt?: number;
  modelId: string;
  modelVersion: string;
  locationEnabled: boolean;
  onboardingCompleted: boolean;
}

export interface AdventureSummary {
  total: number;
  matched: number;
  manual: number;
  skipped: number;
  pending: number;
  resolved: number;
  points: number;
  maxPoints: number;
  durationMs: number | null;
  badge: { id: string; name: string; emoji: string; blurb: string };
}
