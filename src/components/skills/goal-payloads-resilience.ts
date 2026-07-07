import type { Json } from "@/integrations/supabase/types";
import type { SpotCheck } from "@/components/skills/artifact-payloads";

/**
 * Defensive payload parsers for the resilience/cost artifact exhibits
 * (vault.single_point_scan, vault.talent_radar, ledger.cost_benchmark,
 * ledger.efficiency_scan). Pure data — kept apart from the exhibit
 * components so fast refresh works and the shapes are reusable (a payload
 * that fails its contract parses to null and the markdown body still
 * carries the content).
 */

export interface SinglePointScanPayload {
  risks: Array<{
    item: string;
    risk_class: string;
    severity: number;
    exposure: string;
    mitigation_first_step: string;
  }>;
}

export interface TalentRadarPayload {
  reads: Array<{
    competitor: string;
    read: "hiring_observed" | "evidence_thin";
    signals: Array<{ function: string; signal: string; evidence_quote: string }>;
    next_move: string;
  }>;
  spot_check?: SpotCheck;
}

export interface CostBenchmarkPayload {
  archetype: string;
  rows: Array<{
    category: string;
    archetype_norm: string;
    status: "canvas" | "gap";
    canvas_quote: string | null;
    own_read: string | null;
    comparison: string;
    owner_input_needed: string | null;
  }>;
}

export interface EfficiencyScanPayload {
  rows: Array<{
    cost_driver: string;
    vendor: string;
    impact_score: number;
    expected_impact: string;
    evidence_quote: string;
  }>;
  spot_check?: SpotCheck;
}

export function asSinglePointScanPayload(payload: Json): SinglePointScanPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.risks)) return null;
  const risks = record.risks.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.item !== "string" || typeof row.risk_class !== "string") return [];
    return [{
      item: row.item,
      risk_class: row.risk_class,
      severity: Number(row.severity ?? 1),
      exposure: typeof row.exposure === "string" ? row.exposure : "",
      mitigation_first_step: typeof row.mitigation_first_step === "string" ? row.mitigation_first_step : "",
    }];
  });
  return risks.length > 0 ? { risks } : null;
}

export function asTalentRadarPayload(payload: Json): TalentRadarPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.reads)) return null;
  const reads = record.reads.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.competitor !== "string" || typeof row.read !== "string") return [];
    if (row.read !== "hiring_observed" && row.read !== "evidence_thin") return [];
    const signals = Array.isArray(row.signals)
      ? row.signals.flatMap((signal) => {
          const s = asUnknownRecord(signal);
          return s && typeof s.function === "string" && typeof s.signal === "string"
            ? [{
                function: s.function,
                signal: s.signal,
                evidence_quote: typeof s.evidence_quote === "string" ? s.evidence_quote : "",
              }]
            : [];
        })
      : [];
    return [{
      competitor: row.competitor,
      read: row.read as "hiring_observed" | "evidence_thin",
      signals,
      next_move: typeof row.next_move === "string" ? row.next_move : "",
    }];
  });
  return reads.length > 0 ? { reads, spot_check: spotCheck(record) } : null;
}

export function asCostBenchmarkPayload(payload: Json): CostBenchmarkPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || typeof record.archetype !== "string" || !record.archetype) return null;
  if (!Array.isArray(record.rows)) return null;
  const rows = record.rows.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.category !== "string" || typeof row.archetype_norm !== "string") return [];
    if (row.status !== "canvas" && row.status !== "gap") return [];
    return [{
      category: row.category,
      archetype_norm: row.archetype_norm,
      status: row.status as "canvas" | "gap",
      canvas_quote: typeof row.canvas_quote === "string" ? row.canvas_quote : null,
      own_read: typeof row.own_read === "string" ? row.own_read : null,
      comparison: typeof row.comparison === "string" ? row.comparison : "",
      owner_input_needed: typeof row.owner_input_needed === "string" ? row.owner_input_needed : null,
    }];
  });
  return rows.length > 0 ? { archetype: record.archetype, rows } : null;
}

export function asEfficiencyScanPayload(payload: Json): EfficiencyScanPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.rows)) return null;
  const rows = record.rows.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.cost_driver !== "string" || typeof row.vendor !== "string") return [];
    return [{
      cost_driver: row.cost_driver,
      vendor: row.vendor,
      impact_score: Number(row.impact_score ?? 1),
      expected_impact: typeof row.expected_impact === "string" ? row.expected_impact : "",
      evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : "",
    }];
  });
  return rows.length > 0 ? { rows, spot_check: spotCheck(record) } : null;
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
