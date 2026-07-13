import { Globe2 } from "lucide-react";
import {
  CANVAS_SECTION_KEYS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";

/**
 * Atlas briefing contract (spec 12 "State of the Union") — the shared shape
 * stored in `agent_runs.output` for run_type 'atlas_briefing'. The worker
 * computes `coverage` deterministically from the database (B3: the database
 * is the referee); the model only writes the narrative fields. The frontend
 * must parse defensively — a briefing that fails the contract renders as an
 * honest error, never as a half-empty card.
 */

export interface AtlasPositionClaim {
  claim: string;
  /** B1: every claim names the real data it stands on. */
  basis: string;
}

export type AtlasCoverageState = "verified" | "assumed" | "empty";

export interface AtlasCoverageEntry {
  section_key: CanvasSectionKey;
  state: AtlasCoverageState;
  items: number;
}

export interface AtlasDirective {
  room: CanvasSectionKey | null;
  skill_key: string | null;
  action: string;
  /** B4: every directive carries its why. */
  why: string;
}

export interface AtlasBrainCoverage {
  filled: number;
  total: number;
  top_gaps: Array<{ path: string; title: string; score: number; reason: "empty" | "stale" }>;
}

export interface AtlasBriefingPayload {
  kind: "atlas_briefing_v1";
  headline: string;
  position: AtlasPositionClaim[];
  coverage: AtlasCoverageEntry[];
  /** AT-5 coverage engine — computed worker-side; absent on older briefings. */
  brain_coverage: AtlasBrainCoverage | null;
  changes: string[];
  directive: AtlasDirective;
  watchouts: string[];
  generated_at: string;
  model: string;
}

/** Dock identity — primary-accent presentation of the spec 01 orchestrator. */
export const ATLAS = {
  name: "Atlas",
  role: "Chief Strategist",
  icon: Globe2,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSectionKey(value: unknown): value is CanvasSectionKey {
  return (
    typeof value === "string" &&
    (CANVAS_SECTION_KEYS as readonly string[]).includes(value)
  );
}

const COVERAGE_STATES: readonly AtlasCoverageState[] = ["verified", "assumed", "empty"];

function isCoverageState(value: unknown): value is AtlasCoverageState {
  return typeof value === "string" && (COVERAGE_STATES as readonly string[]).includes(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

/**
 * Validate an `agent_runs.output` payload into a briefing, or null. `kind`
 * and a non-empty headline are the hard gate; every other field is coerced
 * (missing arrays become [], malformed entries are dropped) so an older or
 * partially-written payload degrades to a smaller card instead of a crash.
 */
export function parseAtlasBriefing(json: unknown): AtlasBriefingPayload | null {
  if (!isRecord(json) || json.kind !== "atlas_briefing_v1") return null;
  if (typeof json.headline !== "string" || json.headline.trim().length === 0) return null;

  const position: AtlasPositionClaim[] = Array.isArray(json.position)
    ? json.position
        .filter(isRecord)
        .flatMap((entry) =>
          typeof entry.claim === "string" && entry.claim.length > 0
            ? [{ claim: entry.claim, basis: typeof entry.basis === "string" ? entry.basis : "" }]
            : [],
        )
        .slice(0, 4)
    : [];

  const coverage: AtlasCoverageEntry[] = Array.isArray(json.coverage)
    ? json.coverage
        .filter(isRecord)
        .flatMap((entry) =>
          isSectionKey(entry.section_key) && isCoverageState(entry.state)
            ? [
                {
                  section_key: entry.section_key,
                  state: entry.state,
                  items: typeof entry.items === "number" && Number.isFinite(entry.items) ? entry.items : 0,
                },
              ]
            : [],
        )
    : [];

  const directiveRaw = isRecord(json.directive) ? json.directive : {};
  const directive: AtlasDirective = {
    room: isSectionKey(directiveRaw.room) ? directiveRaw.room : null,
    skill_key:
      typeof directiveRaw.skill_key === "string" && directiveRaw.skill_key.length > 0
        ? directiveRaw.skill_key
        : null,
    action: typeof directiveRaw.action === "string" ? directiveRaw.action : "",
    why: typeof directiveRaw.why === "string" ? directiveRaw.why : "",
  };

  return {
    kind: "atlas_briefing_v1",
    headline: json.headline,
    position,
    coverage,
    brain_coverage: parseBrainCoverage(json.brain_coverage),
    changes: stringArray(json.changes),
    directive,
    watchouts: stringArray(json.watchouts).slice(0, 2),
    generated_at: typeof json.generated_at === "string" ? json.generated_at : "",
    model: typeof json.model === "string" ? json.model : "",
  };
}

function parseBrainCoverage(value: unknown): AtlasBrainCoverage | null {
  if (!isRecord(value)) return null;
  if (typeof value.filled !== "number" || typeof value.total !== "number" || value.total <= 0) return null;
  const topGaps = Array.isArray(value.top_gaps)
    ? value.top_gaps
        .filter(isRecord)
        .flatMap((gap) =>
          typeof gap.path === "string" && typeof gap.title === "string"
            ? [
                {
                  path: gap.path,
                  title: gap.title,
                  score: typeof gap.score === "number" && Number.isFinite(gap.score) ? gap.score : 0,
                  reason: gap.reason === "stale" ? ("stale" as const) : ("empty" as const),
                },
              ]
            : [],
        )
        .slice(0, 3)
    : [];
  return { filled: value.filled, total: value.total, top_gaps: topGaps };
}
