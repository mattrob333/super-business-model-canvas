import type { Json } from "@/integrations/supabase/types";
import type { SpotCheck } from "@/components/skills/artifact-payloads";

/**
 * Defensive payload parsers for the competition-goal artifact exhibits. Pure
 * data — kept apart from the exhibit components so fast refresh works and the
 * shapes are reusable (a payload that fails its contract parses to null and
 * the markdown body still carries the content).
 */

export interface ChurnSignalAuditPayload {
  themes: Array<{
    theme: string;
    observed_about: "own" | "competitor";
    company: string;
    evidence_quote: string;
    retention_play: string;
  }>;
  spot_check?: SpotCheck;
}

export interface AdvocacyEngineScanPayload {
  mechanisms: Array<{
    competitor: string;
    mechanism: string;
    source: "live_search" | "competitor_canvas";
    evidence_quote: string;
    equivalent_move: string;
  }>;
  spot_check?: SpotCheck;
}

export interface EcosystemWatchPayload {
  moves: Array<{
    competitor: string;
    partner: string;
    move_summary: string;
    evidence_quote: string;
    counter_partner: string;
    counter_rationale: string;
  }>;
  spot_check?: SpotCheck;
}

export interface OperationalBenchmarkPayload {
  rows: Array<{
    activity: string;
    signal: "visible_investment" | "no_public_signal";
    competitor: string | null;
    signal_type: "hiring" | "shipping" | "both" | null;
    evidence_quote: string | null;
    gap_read: string;
  }>;
  spot_check?: SpotCheck;
}

export interface VelocityWatchPayload {
  reads: Array<{
    competitor: string;
    read: "shipping_observed" | "evidence_thin";
    observations: Array<{ what_shipped: string; evidence_quote: string }>;
    pace_read: string;
  }>;
  velocity_insight: string;
  insight_basis: "evidence_delta" | "evidence_too_thin";
  spot_check?: SpotCheck;
}

export function asChurnSignalAuditPayload(payload: Json): ChurnSignalAuditPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.themes)) return null;
  const themes = record.themes.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.theme !== "string" || typeof row.company !== "string") return [];
    if (typeof row.observed_about !== "string" || !["own", "competitor"].includes(row.observed_about)) return [];
    if (typeof row.evidence_quote !== "string" || typeof row.retention_play !== "string") return [];
    return [{
      theme: row.theme,
      observed_about: row.observed_about as "own" | "competitor",
      company: row.company,
      evidence_quote: row.evidence_quote,
      retention_play: row.retention_play,
    }];
  });
  return themes.length > 0 ? { themes, spot_check: spotCheck(record) } : null;
}

export function asAdvocacyEngineScanPayload(payload: Json): AdvocacyEngineScanPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.mechanisms)) return null;
  const mechanisms = record.mechanisms.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.competitor !== "string" || typeof row.mechanism !== "string") return [];
    if (typeof row.source !== "string" || !["live_search", "competitor_canvas"].includes(row.source)) return [];
    if (typeof row.evidence_quote !== "string" || typeof row.equivalent_move !== "string") return [];
    return [{
      competitor: row.competitor,
      mechanism: row.mechanism,
      source: row.source as "live_search" | "competitor_canvas",
      evidence_quote: row.evidence_quote,
      equivalent_move: row.equivalent_move,
    }];
  });
  return mechanisms.length > 0 ? { mechanisms, spot_check: spotCheck(record) } : null;
}

export function asEcosystemWatchPayload(payload: Json): EcosystemWatchPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.moves)) return null;
  const moves = record.moves.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.competitor !== "string" || typeof row.partner !== "string") return [];
    if (typeof row.move_summary !== "string" || typeof row.evidence_quote !== "string") return [];
    if (typeof row.counter_partner !== "string") return [];
    return [{
      competitor: row.competitor,
      partner: row.partner,
      move_summary: row.move_summary,
      evidence_quote: row.evidence_quote,
      counter_partner: row.counter_partner,
      counter_rationale: typeof row.counter_rationale === "string" ? row.counter_rationale : "",
    }];
  });
  return moves.length > 0 ? { moves, spot_check: spotCheck(record) } : null;
}

export function asOperationalBenchmarkPayload(payload: Json): OperationalBenchmarkPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.rows)) return null;
  const rows = record.rows.flatMap<OperationalBenchmarkPayload["rows"][number]>((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.activity !== "string" || typeof row.gap_read !== "string") return [];
    if (row.signal !== "visible_investment" && row.signal !== "no_public_signal") return [];
    if (row.signal === "visible_investment") {
      // A visible-investment row without its grounding (competitor, proxy
      // type, quote) breaks the contract — drop it rather than decorate it.
      if (typeof row.competitor !== "string" || typeof row.evidence_quote !== "string") return [];
      if (typeof row.signal_type !== "string" || !["hiring", "shipping", "both"].includes(row.signal_type)) return [];
      return [{
        activity: row.activity,
        signal: "visible_investment" as const,
        competitor: row.competitor,
        signal_type: row.signal_type as "hiring" | "shipping" | "both",
        evidence_quote: row.evidence_quote,
        gap_read: row.gap_read,
      }];
    }
    // No public signal claims nothing external — normalize any stray fields
    // to null so the honest absence carries no half-grounded decoration.
    return [{
      activity: row.activity,
      signal: "no_public_signal" as const,
      competitor: null,
      signal_type: null,
      evidence_quote: null,
      gap_read: row.gap_read,
    }];
  });
  return rows.length > 0 ? { rows, spot_check: spotCheck(record) } : null;
}

export function asVelocityWatchPayload(payload: Json): VelocityWatchPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.reads)) return null;
  if (typeof record.velocity_insight !== "string" || !record.velocity_insight) return null;
  if (record.insight_basis !== "evidence_delta" && record.insight_basis !== "evidence_too_thin") return null;
  const reads = record.reads.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.competitor !== "string" || typeof row.pace_read !== "string") return [];
    if (row.read !== "shipping_observed" && row.read !== "evidence_thin") return [];
    const observations = Array.isArray(row.observations)
      ? row.observations.flatMap((observationEntry) => {
          const observation = asUnknownRecord(observationEntry);
          return observation && typeof observation.what_shipped === "string" && typeof observation.evidence_quote === "string"
            ? [{ what_shipped: observation.what_shipped, evidence_quote: observation.evidence_quote }]
            : [];
        })
      : [];
    // A shipping-observed read must carry at least one grounded observation;
    // an evidence-thin read claims nothing and carries none.
    if (row.read === "shipping_observed" && observations.length === 0) return [];
    return [{
      competitor: row.competitor,
      read: row.read as "shipping_observed" | "evidence_thin",
      observations: row.read === "evidence_thin" ? [] : observations,
      pace_read: row.pace_read,
    }];
  });
  return reads.length > 0
    ? {
        reads,
        velocity_insight: record.velocity_insight,
        insight_basis: record.insight_basis as "evidence_delta" | "evidence_too_thin",
        spot_check: spotCheck(record),
      }
    : null;
}

function asPayloadRecord(payload: Json): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function spotCheck(record: Record<string, unknown>): SpotCheck | undefined {
  const value = record.spot_check;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const spot = value as Record<string, unknown>;
  return { checked: Number(spot.checked ?? 0), confirmed: Number(spot.confirmed ?? 0) };
}
