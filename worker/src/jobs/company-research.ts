import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunner } from "../agent/runner.js";
import { ClaudeAgentRunner } from "../agent/runner.js";
import { asRecord } from "../db/json.js";
import { SECTION_LABELS, isSectionKey, type SectionKey } from "../domain/sections.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import type { EvidenceCandidate, FeedRuntimeConfig } from "../feeds/types.js";
import type { AgentJob } from "../queue/types.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";

interface ModelRoute {
  account_id?: string | null;
  route_key?: string | null;
  task_class?: string | null;
  provider: string;
  model_name: string;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

interface BusinessContext {
  id: string;
  company_name: string | null;
  industry: string | null;
  website_url?: string | null;
}

interface ExtractedClaim {
  sectionKey: SectionKey;
  text: string;
  confidence: number;
  evidenceIndex: number;
}

type VerificationStatus = "confirmed" | "unsupported" | "contradicted";

interface VerifiedClaim extends ExtractedClaim {
  status: VerificationStatus;
  reason: string;
  evidenceId: string;
}

export interface CompanyResearchDependencies extends FeedRuntimeConfig {
  client: SupabaseClient;
  runner?: AgentRunner;
  feedRunner?: Pick<FeedRunner, "refresh">;
}

export class CompanyResearchHandler {
  private readonly runner: AgentRunner;
  private readonly feedRunner: Pick<FeedRunner, "refresh">;

  constructor(private readonly deps: CompanyResearchDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
    this.feedRunner = deps.feedRunner ?? new FeedRunner(deps.client, deps);
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const context = await this.loadBusinessContext(job.account_id, payload);
    const companyUrl = readString(payload.company_url ?? payload.companyUrl) ?? context.website_url;
    if (!companyUrl) throw new Error("company_research payload requires company_url or a business context website_url");

    await this.markRunRunning(job, { companyUrl, businessContextVersionId: context.id });

    const feedResult = await this.feedRunner.refresh({
      accountId: job.account_id,
      feedKey: "firecrawl_scrape",
      cacheKey: `company_research:${companyUrl}`,
      companyName: context.company_name ?? undefined,
      companyUrl,
    });
    if (feedResult.health !== "ok") throw new Error(`company_research crawl failed: ${feedResult.error ?? feedResult.health}`);

    const evidenceIds = await this.writeEvidence(job, feedResult.evidence);
    const routes = await this.loadModelRoutes(job.account_id);
    const extractRoute = requiredRoute(routes, job.account_id, "budget", "extract");
    const verifyRoute = requiredRoute(routes, job.account_id, "mid", "research_verify");
    if (verifyRoute.route_key === "budget") throw new Error("research_verify route must not resolve to budget tier");

    const extract = await this.extractClaims(extractRoute, context, feedResult.evidence);
    const escalated = extract.length === 0;
    const claims = escalated
      ? await this.extractClaims(requiredRoute(routes, job.account_id, "mid", "extract"), context, feedResult.evidence)
      : extract;

    await this.writeEscalationMetric(job.account_id, escalated);

    const verified: VerifiedClaim[] = [];
    for (const claim of claims) {
      const evidenceId = evidenceIds[claim.evidenceIndex] ?? evidenceIds[0];
      if (!evidenceId) continue;
      const verdict = await this.verifyClaim(verifyRoute, claim, feedResult.evidence[claim.evidenceIndex] ?? feedResult.evidence[0]);
      verified.push({ ...claim, ...verdict, evidenceId });
    }

    await this.writeVerifiedClaims(job, context, verified);
    await this.markRunCompleted(job, {
      company_url: companyUrl,
      claims: verified.map((claim) => ({
        section_key: claim.sectionKey,
        text: claim.text,
        status: claim.status,
        confidence: earnedConfidence(claim),
      })),
      escalation_rate: escalated ? 1 : 0,
    });
  }

  private async loadBusinessContext(accountId: string, payload: Record<string, unknown>): Promise<BusinessContext> {
    const contextId = readString(payload.business_context_version_id ?? payload.businessContextVersionId);
    let query = this.deps.client
      .from("business_context_versions")
      .select("id, company_name, industry, website_url")
      .eq("account_id", accountId);
    query = contextId ? query.eq("id", contextId) : query.order("created_at", { ascending: false });
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`Failed to load business context: ${error.message}`);
    if (!data) throw new Error("company_research requires a business context version");
    return data as BusinessContext;
  }

  private async loadModelRoutes(accountId: string): Promise<ModelRoute[]> {
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .or("task_class.eq.extract,task_class.eq.research_verify,route_key.eq.budget,route_key.eq.mid")
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load research model routes: ${error.message}`);
    return (data ?? []) as ModelRoute[];
  }

  private async extractClaims(route: ModelRoute, context: BusinessContext, evidence: EvidenceCandidate[]): Promise<ExtractedClaim[]> {
    const result = await this.runner.run({
      model: route.model_name,
      maxTurns: 12,
      maxBudgetUsd: budgetForRoute(route),
      prompt: `Extract Business Model Canvas claims for ${context.company_name ?? "the company"} from these source excerpts. Return JSON only: {"claims":[{"section_key":"value_propositions","text":"...","confidence":0.7,"evidence_index":0}]}.\n\n${evidencePrompt(evidence)}`,
      systemPrompt: "You extract concise, source-grounded Business Model Canvas claims. Do not invent claims.",
      mcpServers: {},
      allowedTools: [],
    });
    return parseClaims(result.resultText);
  }

  private async verifyClaim(route: ModelRoute, claim: ExtractedClaim, evidence: EvidenceCandidate | undefined): Promise<{ status: VerificationStatus; reason: string }> {
    const result = await this.runner.run({
      model: route.model_name,
      maxTurns: 8,
      maxBudgetUsd: budgetForRoute(route),
      prompt: `Classify the claim against the source excerpt as confirmed, unsupported, or contradicted. Return JSON only: {"status":"confirmed","reason":"..."}.\n\nClaim: ${claim.text}\n\nSource excerpt:\n${evidence?.excerpt ?? ""}`,
      systemPrompt: "You are an adversarial verifier. Never give credit for claims not supported by the excerpt.",
      mcpServers: {},
      allowedTools: [],
    });
    return parseVerification(result.resultText);
  }

  private async writeEvidence(job: AgentJob, evidence: EvidenceCandidate[]): Promise<string[]> {
    const ids: string[] = [];
    for (const item of evidence) {
      const { data, error } = await this.deps.client
        .from("evidence_items")
        .insert({
          account_id: job.account_id,
          title: item.title,
          excerpt: item.excerpt ?? null,
          source_url: item.sourceUrl ?? null,
          source_name: item.sourceName ?? null,
          source_type: item.sourceType,
          source_date: item.sourceDate ?? null,
          metadata: item.metadata ?? {},
          created_by_agent_run_id: job.agent_run_id,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to write research evidence: ${error.message}`);
      ids.push(data.id);
    }
    return ids;
  }

  private async writeVerifiedClaims(job: AgentJob, context: BusinessContext, claims: VerifiedClaim[]): Promise<void> {
    const grouped = new Map<SectionKey, VerifiedClaim[]>();
    for (const claim of claims) {
      if (claim.status === "contradicted") {
        await this.writeContradiction(job, claim);
        continue;
      }
      const group = grouped.get(claim.sectionKey) ?? [];
      group.push(claim);
      grouped.set(claim.sectionKey, group);
    }

    for (const [sectionKey, sectionClaims] of grouped) {
      const { error } = await this.deps.client.from("canvas_section_versions").insert({
        account_id: job.account_id,
        business_context_version_id: context.id,
        section_key: sectionKey,
        section_title: SECTION_LABELS[sectionKey],
        items: sectionClaims.map((claim) => ({
          text: claim.text,
          confidence: earnedConfidence(claim),
          evidence_ids: [claim.evidenceId],
          verification_status: claim.status,
          flags: claim.status === "unsupported" ? ["unsupported"] : [],
        })),
        notes: "Generated by company_research with adversarial verification.",
        confidence: average(sectionClaims.map(earnedConfidence)),
        freshness_status: "verified",
        last_verified_at: new Date().toISOString(),
      });
      if (error) throw new Error(`Failed to write researched canvas section: ${error.message}`);
    }
  }

  private async writeContradiction(job: AgentJob, claim: VerifiedClaim): Promise<void> {
    const gap = {
      account_id: job.account_id,
      title: `Contradicted research claim: ${claim.text}`,
      description: claim.reason,
      gap_type: "contradictory",
      severity: "medium",
      affected_sections: [claim.sectionKey],
      evidence_ids: [claim.evidenceId],
      created_by_agent_run_id: job.agent_run_id,
    };
    const { error: gapError } = await this.deps.client.from("gaps").insert(gap);
    if (gapError) throw new Error(`Failed to write contradicted claim gap: ${gapError.message}`);

    const { error: insightError } = await this.deps.client.from("insights").insert({
      account_id: job.account_id,
      severity: "warning",
      title: "Contradicted research claim",
      body: `${claim.text}\n\n${claim.reason}`,
      section_key: claim.sectionKey,
      tags: ["company_research", "contradicted"],
      evidence_ids: [claim.evidenceId],
      agent_run_id: job.agent_run_id,
    });
    if (insightError) throw new Error(`Failed to write contradicted claim insight: ${insightError.message}`);
  }

  private async writeEscalationMetric(accountId: string, escalated: boolean): Promise<void> {
    const { error } = await this.deps.client.from("metric_snapshots").insert({
      account_id: accountId,
      metric_key: "research.escalation_rate",
      value: escalated ? 1 : 0,
      label: "firecrawl_scrape",
      inputs: { feed_key: "firecrawl_scrape", escalated },
    });
    if (error) throw new Error(`Failed to write escalation metric: ${error.message}`);
  }

  private async markRunRunning(job: AgentJob, input: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client.from("agent_runs").update({
      status: "running",
      run_type: "company_research",
      input,
      started_at: new Date().toISOString(),
    }).eq("id", job.agent_run_id).eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark company research run running: ${error.message}`);
  }

  private async markRunCompleted(job: AgentJob, output: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client.from("agent_runs").update({
      status: "completed",
      output,
      summary: "Company research completed with evidence-linked canvas updates.",
      completed_at: new Date().toISOString(),
      error: null,
    }).eq("id", job.agent_run_id).eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark company research run completed: ${error.message}`);
  }
}

function requiredRoute(routes: ModelRoute[], accountId: string, routeKey: string, taskClass: string): ModelRoute {
  const route = chooseModelRoute(routes.filter((candidate) => candidate.task_class === taskClass), accountId, routeKey, taskClass);
  if (!route) throw new Error(`No model route configured for ${taskClass}/${routeKey}`);
  return route;
}

function parseClaims(text: string): ExtractedClaim[] {
  const parsed = JSON.parse(text) as { claims?: unknown };
  if (!Array.isArray(parsed.claims)) return [];
  return parsed.claims.flatMap((claim) => {
    const record = asRecord(claim);
    const sectionKey = record.section_key;
    const claimText = readString(record.text);
    if (!isSectionKey(sectionKey) || !claimText) return [];
    return [{
      sectionKey,
      text: claimText,
      confidence: clampConfidence(record.confidence),
      evidenceIndex: typeof record.evidence_index === "number" ? Math.max(0, Math.floor(record.evidence_index)) : 0,
    }];
  });
}

function parseVerification(text: string): { status: VerificationStatus; reason: string } {
  const parsed = asRecord(JSON.parse(text));
  const status = parsed.status;
  if (status !== "confirmed" && status !== "unsupported" && status !== "contradicted") {
    return { status: "unsupported", reason: "Verifier returned an invalid status." };
  }
  return { status, reason: readString(parsed.reason) ?? "" };
}

function earnedConfidence(claim: VerifiedClaim): number {
  if (claim.status === "unsupported") return Math.min(claim.confidence, 0.5);
  if (claim.status === "contradicted") return 0;
  return claim.confidence;
}

function evidencePrompt(evidence: EvidenceCandidate[]): string {
  return evidence.map((item, index) => `[${index}] ${item.title}\n${item.excerpt ?? ""}`).join("\n\n");
}

function clampConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function budgetForRoute(route: ModelRoute): number {
  const input = route.cost_per_1k_in ?? 0.002;
  const output = route.cost_per_1k_out ?? 0.01;
  return Math.max(0.03, input * 8 + output * 4);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
