import type { Json } from "@/integrations/supabase/types";

/**
 * Defensive payload parsers for the Phase G artifact exhibits. Pure data —
 * kept apart from the exhibit components so fast refresh works and the
 * shapes are reusable (a payload that fails its contract parses to null and
 * the markdown body still carries the content).
 */

export interface SpotCheck {
  checked: number;
  confirmed: number;
}

export interface MoatPayload {
  rows: Array<{ resource: string; moat_class: string; durability: number; basis: string }>;
}

export interface PositioningPayload {
  statement: {
    for_segment: string;
    who_need: string;
    category: string;
    key_differentiator: string;
    unlike_alternative: string;
    because_proof: string;
  };
  pillars: Array<{ pillar: string; grounded_in: string; segment_language: string }>;
  tone_notes?: string;
}

export interface UnitEconomicsPayload {
  variables: Array<{
    variable: string;
    status: "known" | "estimated_from_canvas" | "unknown";
    value_or_range: string | null;
    canvas_quote: string | null;
    basis: string;
    owner_input_needed: string | null;
  }>;
}

export interface SupplyChainPayload {
  upstream: string[];
  downstream: string[];
  candidates: Array<{ name: string; role: string; fit_score: number; rationale: string; evidence_quote: string }>;
  spot_check?: SpotCheck;
}

export interface LifecyclePayload {
  stages: Array<{
    stage: string;
    your_motion: string;
    competitor_motions: Array<{ competitor: string; motion: string }>;
    gap: boolean;
    recommendation: string;
  }>;
  spot_check?: SpotCheck;
}

export interface BuildVsBuyPayload {
  rows: Array<{
    activity: string;
    verdict: string;
    market_alternatives: Array<{ name: string; evidence_quote: string }>;
    switching_sketch: string | null;
    rationale: string;
  }>;
  spot_check?: SpotCheck;
}

export function asMoatPayload(payload: Json): MoatPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.rows)) return null;
  const rows = record.rows.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.resource !== "string" || typeof row.moat_class !== "string") return [];
    return [{
      resource: row.resource,
      moat_class: row.moat_class,
      durability: Number(row.durability ?? 1),
      basis: typeof row.basis === "string" ? row.basis : "",
    }];
  });
  return rows.length > 0 ? { rows } : null;
}

export function asPositioningPayload(payload: Json): PositioningPayload | null {
  const record = asPayloadRecord(payload);
  const statement = asUnknownRecord(record?.statement);
  if (!record || !statement) return null;
  const slots = ["for_segment", "who_need", "category", "key_differentiator", "unlike_alternative", "because_proof"] as const;
  if (!slots.every((slot) => typeof statement[slot] === "string" && statement[slot])) return null;
  const pillars = Array.isArray(record.pillars)
    ? record.pillars.flatMap((entry) => {
        const row = asUnknownRecord(entry);
        return row && typeof row.pillar === "string" && typeof row.grounded_in === "string"
          ? [{ pillar: row.pillar, grounded_in: row.grounded_in, segment_language: typeof row.segment_language === "string" ? row.segment_language : "" }]
          : [];
      })
    : [];
  return {
    statement: {
      for_segment: statement.for_segment as string,
      who_need: statement.who_need as string,
      category: statement.category as string,
      key_differentiator: statement.key_differentiator as string,
      unlike_alternative: statement.unlike_alternative as string,
      because_proof: statement.because_proof as string,
    },
    pillars,
    tone_notes: typeof record.tone_notes === "string" ? record.tone_notes : undefined,
  };
}

export function asUnitEconomicsPayload(payload: Json): UnitEconomicsPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.variables)) return null;
  const variables = record.variables.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.variable !== "string" || typeof row.status !== "string") return [];
    if (!["known", "estimated_from_canvas", "unknown"].includes(row.status)) return [];
    return [{
      variable: row.variable,
      status: row.status as "known" | "estimated_from_canvas" | "unknown",
      value_or_range: typeof row.value_or_range === "string" ? row.value_or_range : null,
      canvas_quote: typeof row.canvas_quote === "string" ? row.canvas_quote : null,
      basis: typeof row.basis === "string" ? row.basis : "",
      owner_input_needed: typeof row.owner_input_needed === "string" ? row.owner_input_needed : null,
    }];
  });
  return variables.length > 0 ? { variables } : null;
}

export function asSupplyChainPayload(payload: Json): SupplyChainPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.candidates)) return null;
  const candidates = record.candidates.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.name !== "string" || typeof row.role !== "string") return [];
    return [{
      name: row.name,
      role: row.role,
      fit_score: Number(row.fit_score ?? 0),
      rationale: typeof row.rationale === "string" ? row.rationale : "",
      evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : "",
    }];
  });
  return candidates.length > 0
    ? { upstream: strings(record.upstream), downstream: strings(record.downstream), candidates, spot_check: spotCheck(record) }
    : null;
}

export function asLifecyclePayload(payload: Json): LifecyclePayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.stages)) return null;
  const stages = record.stages.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.stage !== "string" || typeof row.your_motion !== "string") return [];
    const motions = Array.isArray(row.competitor_motions)
      ? row.competitor_motions.flatMap((motion) => {
          const m = asUnknownRecord(motion);
          return m && typeof m.competitor === "string" && typeof m.motion === "string"
            ? [{ competitor: m.competitor, motion: m.motion }]
            : [];
        })
      : [];
    return [{
      stage: row.stage,
      your_motion: row.your_motion,
      competitor_motions: motions,
      gap: Boolean(row.gap),
      recommendation: typeof row.recommendation === "string" ? row.recommendation : "",
    }];
  });
  return stages.length > 0 ? { stages, spot_check: spotCheck(record) } : null;
}

export function asBuildVsBuyPayload(payload: Json): BuildVsBuyPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.rows)) return null;
  const rows = record.rows.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.activity !== "string" || typeof row.verdict !== "string") return [];
    const alternatives = Array.isArray(row.market_alternatives)
      ? row.market_alternatives.flatMap((alt) => {
          const a = asUnknownRecord(alt);
          return a && typeof a.name === "string"
            ? [{ name: a.name, evidence_quote: typeof a.evidence_quote === "string" ? a.evidence_quote : "" }]
            : [];
        })
      : [];
    return [{
      activity: row.activity,
      verdict: row.verdict,
      market_alternatives: alternatives,
      switching_sketch: typeof row.switching_sketch === "string" ? row.switching_sketch : null,
      rationale: typeof row.rationale === "string" ? row.rationale : "",
    }];
  });
  return rows.length > 0 ? { rows, spot_check: spotCheck(record) } : null;
}

export function phaseGSpotCheck(payload: Json): SpotCheck | undefined {
  const record = asPayloadRecord(payload);
  return record ? spotCheck(record) : undefined;
}

function asPayloadRecord(payload: Json): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function spotCheck(record: Record<string, unknown>): SpotCheck | undefined {
  const value = record.spot_check;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const spot = value as Record<string, unknown>;
  return { checked: Number(spot.checked ?? 0), confirmed: Number(spot.confirmed ?? 0) };
}
