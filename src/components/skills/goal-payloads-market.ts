import type { Json } from "@/integrations/supabase/types";
import type { SpotCheck } from "@/components/skills/artifact-payloads";

/**
 * Defensive payload parsers for the market-facing goal artifact exhibits
 * (monetization gaps, WTP signals, watering holes, message-market fit,
 * partner outreach). Pure data — kept apart from the exhibit components so
 * fast refresh works and the shapes are reusable (a payload that fails its
 * contract parses to null and the markdown body still carries the content).
 */

export interface MonetizationGapsPayload {
  gaps: Array<{
    model: string;
    competitors: Array<{ competitor: string; evidence_quote: string }>;
    adoption_rationale: string;
    first_experiment: string;
  }>;
  verification?: string;
}

export type WtpSignal = "underpriced" | "overpriced" | "aligned" | "unknown";

export interface WtpSignalsPayload {
  signals: Array<{
    segment: string;
    signal: WtpSignal;
    rationale: string;
    evidence_quote: string;
  }>;
  spot_check?: SpotCheck;
}

export interface WateringHolesPayload {
  holes: Array<{
    rank: number;
    name: string;
    segment: string;
    evidence_quote: string;
    entry_strategy: string;
  }>;
  spot_check?: SpotCheck;
}

export interface MessageMarketFitPayload {
  rows: Array<{
    your_line: string;
    their_words: string | null;
    why_it_lands: string;
    status: "rewritten" | "unknown";
  }>;
  verification?: string;
}

export interface PartnerOutreachPayload {
  status: string;
  drafts: Array<{
    partner_name: string;
    subject: string;
    body: string;
    rationale: string;
    evidence_quote: string;
  }>;
  verification?: string;
}

export function asMonetizationGapsPayload(payload: Json): MonetizationGapsPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.gaps)) return null;
  const gaps = record.gaps.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.model !== "string" || !Array.isArray(row.competitors)) return [];
    const competitors = row.competitors.flatMap((citation) => {
      const cite = asUnknownRecord(citation);
      return cite && typeof cite.competitor === "string"
        ? [{ competitor: cite.competitor, evidence_quote: typeof cite.evidence_quote === "string" ? cite.evidence_quote : "" }]
        : [];
    });
    // A gap with zero citations is an uncited claim about the market — drop it.
    if (competitors.length === 0) return [];
    return [{
      model: row.model,
      competitors,
      adoption_rationale: typeof row.adoption_rationale === "string" ? row.adoption_rationale : "",
      first_experiment: typeof row.first_experiment === "string" ? row.first_experiment : "",
    }];
  });
  // Zero gaps is a legitimate outcome (monetization parity), but the story
  // lives in body_md — fall back to markdown rather than an empty table.
  return gaps.length > 0
    ? { gaps, verification: typeof record.verification === "string" ? record.verification : undefined }
    : null;
}

export function asWtpSignalsPayload(payload: Json): WtpSignalsPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.signals)) return null;
  const signals = record.signals.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.segment !== "string" || typeof row.signal !== "string") return [];
    if (!["underpriced", "overpriced", "aligned", "unknown"].includes(row.signal)) return [];
    return [{
      segment: row.segment,
      signal: row.signal as WtpSignal,
      rationale: typeof row.rationale === "string" ? row.rationale : "",
      evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : "",
    }];
  });
  return signals.length > 0 ? { signals, spot_check: spotCheck(record) } : null;
}

export function asWateringHolesPayload(payload: Json): WateringHolesPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.holes)) return null;
  const holes = record.holes.flatMap((entry, index) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.name !== "string" || typeof row.segment !== "string") return [];
    const rank = Number(row.rank ?? index + 1);
    return [{
      rank: Number.isFinite(rank) ? rank : index + 1,
      name: row.name,
      segment: row.segment,
      evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : "",
      entry_strategy: typeof row.entry_strategy === "string" ? row.entry_strategy : "",
    }];
  });
  return holes.length > 0 ? { holes, spot_check: spotCheck(record) } : null;
}

export function asMessageMarketFitPayload(payload: Json): MessageMarketFitPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.rows)) return null;
  const rows = record.rows.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.your_line !== "string" || typeof row.status !== "string") return [];
    if (row.status !== "rewritten" && row.status !== "unknown") return [];
    const theirWords = typeof row.their_words === "string" ? row.their_words : null;
    // A "rewritten" row without the rewrite has nothing to show — drop it.
    if (row.status === "rewritten" && !theirWords) return [];
    return [{
      your_line: row.your_line,
      their_words: row.status === "rewritten" ? theirWords : null,
      why_it_lands: typeof row.why_it_lands === "string" ? row.why_it_lands : "",
      status: row.status as "rewritten" | "unknown",
    }];
  });
  return rows.length > 0
    ? { rows, verification: typeof record.verification === "string" ? record.verification : undefined }
    : null;
}

export function asPartnerOutreachPayload(payload: Json): PartnerOutreachPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.drafts)) return null;
  const drafts = record.drafts.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.partner_name !== "string" || typeof row.body !== "string") return [];
    return [{
      partner_name: row.partner_name,
      subject: typeof row.subject === "string" ? row.subject : "",
      body: row.body,
      rationale: typeof row.rationale === "string" ? row.rationale : "",
      evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : "",
    }];
  });
  return drafts.length > 0
    ? {
        status: typeof record.status === "string" ? record.status : "drafts_awaiting_owner_approval",
        drafts,
        verification: typeof record.verification === "string" ? record.verification : undefined,
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
