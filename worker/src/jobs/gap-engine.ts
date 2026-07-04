import type { SupabaseClient } from "@supabase/supabase-js";
import { asRecord } from "../db/json.js";
import { SECTION_LABELS, SECTION_KEYS, type SectionKey } from "../domain/sections.js";
import type { AgentJob } from "../queue/types.js";
import { markJobRunCompleted } from "./run-status.js";

const GAP_FORMULA_VERSION = "competitor_gap_v1";
const THREAT_FORMULA_VERSION = "threat_index_v1";

interface CompanyRow {
  id: string;
  name: string;
  website_url: string | null;
}

interface CanvasVersionRow {
  id: string;
  competitor_id: string | null;
  section_key: string;
  items: unknown;
  confidence: number | null;
  created_at: string;
}

interface CanvasItem {
  text: string;
  confidence: number;
  evidence_ids: string[];
}

interface GapCandidate {
  competitor: CompanyRow;
  sectionKey: SectionKey;
  competitorItem: CanvasItem;
  bestOverlap: number;
  score: number;
  severity: "critical" | "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
}

export class GapEngineHandler {
  constructor(private readonly client: SupabaseClient) {}

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const requestedCompetitorId = readString(payload.competitor_id ?? payload.competitorId);
    const competitors = await this.loadCompetitors(job.account_id, requestedCompetitorId);
    const versions = await this.loadCanvasVersions(job.account_id);
    const ownBySection = latestOwnCanvasBySection(versions);
    const competitorById = latestCompetitorCanvasById(versions);

    const gaps: GapCandidate[] = [];
    for (const competitor of competitors) {
      const competitorSections = competitorById.get(competitor.id) ?? new Map<SectionKey, CanvasVersionRow>();
      for (const sectionKey of SECTION_KEYS) {
        const ownItems = itemsFromVersion(ownBySection.get(sectionKey));
        const competitorItems = itemsFromVersion(competitorSections.get(sectionKey));
        for (const competitorItem of competitorItems) {
          const bestOverlap = bestItemOverlap(competitorItem, ownItems);
          if (bestOverlap >= 0.58) continue;
          gaps.push(scoreGap(competitor, sectionKey, competitorItem, bestOverlap));
        }
      }
    }

    await this.writeGaps(job, competitors, gaps);
    await this.writeMetrics(job.account_id, competitors, gaps);
    await markJobRunCompleted(this.client, job, "Gap engine completed competitor comparison.", {
      competitors_analyzed: competitors.length,
      gaps_created: gaps.length,
      formula_version: GAP_FORMULA_VERSION,
      threat_formula_version: THREAT_FORMULA_VERSION,
    });
  }

  private async loadCompetitors(accountId: string, competitorId: string | undefined): Promise<CompanyRow[]> {
    let query = this.client
      .from("companies")
      .select("id, name, website_url")
      .eq("account_id", accountId)
      .eq("is_competitor", true);
    if (competitorId) query = query.eq("id", competitorId);
    const { data, error } = await query.order("name", { ascending: true });
    if (error) throw new Error(`Failed to load competitors for gap engine: ${error.message}`);
    return (data ?? []) as CompanyRow[];
  }

  private async loadCanvasVersions(accountId: string): Promise<CanvasVersionRow[]> {
    const { data, error } = await this.client
      .from("canvas_section_versions")
      .select("id, competitor_id, section_key, items, confidence, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load canvas versions for gap engine: ${error.message}`);
    return (data ?? []) as CanvasVersionRow[];
  }

  private async writeGaps(job: AgentJob, competitors: CompanyRow[], gaps: GapCandidate[]): Promise<void> {
    // Idempotency (RF-4-5): each run supersedes the prior open competitive gaps for the
    // competitors it analyzed, so re-runs and mid-job retries never duplicate rows.
    if (competitors.length > 0) {
      const { error: supersedeError } = await this.client
        .from("gaps")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("account_id", job.account_id)
        .eq("gap_type", "competitive")
        .in("competitor_id", competitors.map((competitor) => competitor.id))
        .in("status", ["open", "acknowledged"]);
      if (supersedeError) throw new Error(`Failed to supersede prior competitive gaps: ${supersedeError.message}`);
    }
    if (gaps.length === 0) return;
    const rows = gaps.map((gap) => ({
      account_id: job.account_id,
      competitor_id: gap.competitor.id,
      title: `${gap.competitor.name} advantage in ${SECTION_LABELS[gap.sectionKey]}`,
      description: gap.competitorItem.text,
      gap_type: "competitive",
      severity: gap.severity,
      score: gap.score,
      score_inputs: {
        formula_version: GAP_FORMULA_VERSION,
        impact: gap.impact,
        effort: gap.effort,
        competitor_confidence: gap.competitorItem.confidence,
        best_overlap: gap.bestOverlap,
      },
      formula_version: GAP_FORMULA_VERSION,
      impact: gap.impact,
      effort: gap.effort,
      confidence: gap.competitorItem.confidence,
      affected_sections: [gap.sectionKey],
      evidence_ids: gap.competitorItem.evidence_ids,
      recommended_action: `Review ${gap.competitor.name}'s ${SECTION_LABELS[gap.sectionKey]} approach and decide whether to counter, ignore, or borrow through the proposal loop.`,
      created_by_agent_run_id: job.agent_run_id,
    }));
    const { error } = await this.client.from("gaps").insert(rows);
    if (error) throw new Error(`Failed to write competitor gaps: ${error.message}`);
  }

  private async writeMetrics(accountId: string, competitors: CompanyRow[], gaps: GapCandidate[]): Promise<void> {
    const rows: Array<Record<string, unknown>> = [];
    for (const competitor of competitors) {
      const competitorGaps = gaps.filter((gap) => gap.competitor.id === competitor.id);
      const sections = new Set(competitorGaps.map((gap) => gap.sectionKey));
      for (const sectionKey of sections) {
        const sectionGaps = competitorGaps.filter((gap) => gap.sectionKey === sectionKey);
        rows.push({
          account_id: accountId,
          metric_key: "competitor.section_delta",
          section_key: sectionKey,
          value: round2(average(sectionGaps.map((gap) => gap.score))),
          label: competitor.name,
          inputs: {
            competitor_id: competitor.id,
            formula_version: GAP_FORMULA_VERSION,
            gap_count: sectionGaps.length,
          },
        });
      }

      const sectionOverlap = sections.size / SECTION_KEYS.length;
      const pricingAggression = competitorGaps.some((gap) => gap.sectionKey === "revenue_streams") ? 1.25 : 1;
      // Momentum is a v1 placeholder (baseline 100) until Phase 7 metric families compute
      // real momentum; disclosed in inputs so consumers can tell placeholder from measured.
      const momentum = 100;
      const threatIndex = round2(momentum * Math.max(0.1, sectionOverlap) * pricingAggression);
      rows.push({
        account_id: accountId,
        metric_key: "competitor.threat_index",
        value: threatIndex,
        label: competitor.name,
        inputs: {
          competitor_id: competitor.id,
          formula_version: THREAT_FORMULA_VERSION,
          momentum,
          momentum_source: "placeholder_baseline_v1",
          section_overlap: round2(sectionOverlap),
          pricing_aggression: pricingAggression,
          gap_count: competitorGaps.length,
        },
      });
    }
    if (rows.length === 0) return;
    const { error } = await this.client.from("metric_snapshots").insert(rows);
    if (error) throw new Error(`Failed to write competitor metrics: ${error.message}`);
  }
}

function latestOwnCanvasBySection(rows: CanvasVersionRow[]): Map<SectionKey, CanvasVersionRow> {
  const bySection = new Map<SectionKey, CanvasVersionRow>();
  for (const row of rows) {
    if (row.competitor_id !== null || !isSectionKey(row.section_key) || bySection.has(row.section_key)) continue;
    bySection.set(row.section_key, row);
  }
  return bySection;
}

function latestCompetitorCanvasById(rows: CanvasVersionRow[]): Map<string, Map<SectionKey, CanvasVersionRow>> {
  const byCompetitor = new Map<string, Map<SectionKey, CanvasVersionRow>>();
  for (const row of rows) {
    if (!row.competitor_id || !isSectionKey(row.section_key)) continue;
    const bySection = byCompetitor.get(row.competitor_id) ?? new Map<SectionKey, CanvasVersionRow>();
    if (!bySection.has(row.section_key)) bySection.set(row.section_key, row);
    byCompetitor.set(row.competitor_id, bySection);
  }
  return byCompetitor;
}

function itemsFromVersion(row: CanvasVersionRow | undefined): CanvasItem[] {
  if (!row || !Array.isArray(row.items)) return [];
  return row.items.flatMap((item) => {
    if (typeof item === "string") return [{ text: item, confidence: row.confidence ?? 0.5, evidence_ids: [] }];
    const record = asRecord(item);
    const text = readString(record.text);
    if (!text) return [];
    const evidenceIds = Array.isArray(record.evidence_ids)
      ? record.evidence_ids.filter((id): id is string => typeof id === "string")
      : [];
    return [{
      text,
      confidence: clamp(record.confidence, row.confidence ?? 0.5),
      evidence_ids: evidenceIds,
    }];
  });
}

function scoreGap(competitor: CompanyRow, sectionKey: SectionKey, competitorItem: CanvasItem, bestOverlap: number): GapCandidate {
  const novelty = 1 - bestOverlap;
  const confidence = competitorItem.confidence;
  const score = round2(novelty * confidence * 100);
  const impact = score >= 55 ? "high" : score >= 30 ? "medium" : "low";
  const effort = sectionKey === "channels" || sectionKey === "customer_relationships" ? "medium" : "high";
  const severity = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";
  return { competitor, sectionKey, competitorItem, bestOverlap: round2(bestOverlap), score, severity, impact, effort };
}

function bestItemOverlap(candidate: CanvasItem, ownItems: CanvasItem[]): number {
  if (ownItems.length === 0) return 0;
  return Math.max(...ownItems.map((own) => tokenOverlap(candidate.text, own.text)));
}

function tokenOverlap(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.max(left.size, right.size);
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 2));
}

function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

