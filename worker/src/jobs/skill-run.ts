import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunner } from "../agent/runner.js";
import { ClaudeAgentRunner, OpenRouterChatRunner } from "../agent/runner.js";
import { asRecord } from "../db/json.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import type { FeedRuntimeConfig } from "../feeds/types.js";
import type { AgentJob } from "../queue/types.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";
import { verifyClaimAgainstExcerpt } from "./company-research.js";

/**
 * Spec 10: the skill_run pipeline. One job kind, a registry of skill
 * implementations keyed by skill_key. Every skill ends in a typed
 * skill_artifacts row: markdown body + JSON payload + evidence links, with a
 * verifier spot-check before anything ships. Unimplemented skills fail
 * loudly — the catalog's `implemented` flag is the UI's source of truth.
 */

interface ModelRoute {
  account_id?: string | null;
  route_key?: string | null;
  task_class?: string | null;
  provider: string;
  model_name: string;
  params?: Record<string, unknown> | null;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

interface CompetitorPricingSource {
  competitorId: string;
  name: string;
  pricingUrl: string;
  excerpt: string;
  evidenceId: string;
}

export interface SkillRunDependencies extends FeedRuntimeConfig {
  client: SupabaseClient;
  runner?: AgentRunner;
  feedRunner?: Pick<FeedRunner, "refresh">;
  openRouterApiKey?: string;
  fetch?: typeof fetch;
}

export class SkillRunHandler {
  private readonly runner: AgentRunner;
  private readonly feedRunner: Pick<FeedRunner, "refresh">;

  constructor(private readonly deps: SkillRunDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
    this.feedRunner = deps.feedRunner ?? new FeedRunner(deps.client, deps);
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const skillKey = readString(payload.skill_key ?? payload.skillKey);
    if (!skillKey) throw new Error("skill_run requires skill_key");
    await this.markRunRunning(job, skillKey);

    if (skillKey === "yield.pricing_teardown") {
      await this.runPricingTeardown(job);
      return;
    }
    throw new Error(`skill ${skillKey} is not implemented in the worker (catalog implemented flag must stay false)`);
  }

  /**
   * yield.pricing_teardown — crawl each researched competitor's pricing page
   * (fallback: homepage crawl already cached from research), normalize into a
   * pricing matrix + recommendation memo, verifier-spot-check matrix claims,
   * write the artifact.
   */
  private async runPricingTeardown(job: AgentJob): Promise<void> {
    const competitors = await this.loadCompetitors(job.account_id);
    if (competitors.length === 0) {
      throw new Error("pricing_teardown requires at least one competitor entity — run competitor research first");
    }

    const sources: CompetitorPricingSource[] = [];
    for (const competitor of competitors) {
      if (!competitor.website_url) continue;
      const pricingUrl = joinUrl(competitor.website_url, "/pricing");
      let result = await this.feedRunner.refresh({
        accountId: job.account_id,
        feedKey: "firecrawl_scrape",
        cacheKey: `pricing_teardown:${competitor.id}:${pricingUrl}`,
        companyName: competitor.name,
        companyUrl: pricingUrl,
      });
      if (result.health !== "ok" || !result.evidence[0]?.excerpt) {
        // Honest fallback: the homepage crawl (usually cached from research).
        result = await this.feedRunner.refresh({
          accountId: job.account_id,
          feedKey: "firecrawl_scrape",
          cacheKey: `competitor_research:${competitor.id}:${competitor.website_url}`,
          companyName: competitor.name,
          companyUrl: competitor.website_url,
        });
      }
      const excerpt = result.health === "ok" ? result.evidence[0]?.excerpt : undefined;
      if (!excerpt) continue;
      const evidenceId = await this.writeEvidence(job, {
        title: `${competitor.name} pricing source`,
        sourceUrl: pricingUrl,
        excerpt,
      });
      sources.push({ competitorId: competitor.id, name: competitor.name, pricingUrl, excerpt, evidenceId });
    }
    if (sources.length === 0) {
      throw new Error("pricing_teardown could not retrieve any competitor pricing content — check Firecrawl health");
    }

    const ownItems = await this.loadOwnRevenueItems(job.account_id);
    const routes = await this.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
    const route = requiredRoute(routes, job.account_id, "skill_run", "skill_run");
    const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");

    const result = await runModelStep(
      `pricing_teardown normalize (${route.provider}/${route.model_name})`,
      () => this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route),
        prompt: pricingTeardownPrompt(sources, ownItems),
        systemPrompt:
          "You are a pricing strategist. Normalize competitor pricing into a comparable matrix from the excerpts ONLY — never invent prices. Mark unknowns as unknown.",
        mcpServers: {},
        allowedTools: [],
      }),
    );
    const artifact = parsePricingArtifact(result.resultText, sources);
    if (!artifact) throw new Error("pricing_teardown produced unparseable output; refusing to write an artifact");

    // Verifier spot-check: up to 3 matrix rows against their own source excerpt.
    let confirmed = 0;
    const checks = artifact.matrix.slice(0, 3);
    for (const row of checks) {
      const source = sources.find((entry) => entry.competitorId === row.competitor_id);
      if (!source) continue;
      const claim = `${source.name} pricing: model=${row.model}; price points=${row.price_points.join(", ") || "unknown"}`;
      const verdict = await runModelStep(
        `pricing_teardown spot-check for ${source.name} (${verifyRoute.provider}/${verifyRoute.model_name})`,
        () => verifyClaimAgainstExcerpt(this.runnerForRoute(verifyRoute), verifyRoute, claim, source.excerpt),
      );
      if (verdict.status === "contradicted") {
        throw new Error(`pricing_teardown spot-check contradicted for ${source.name}: ${verdict.reason}`);
      }
      if (verdict.status === "confirmed") confirmed += 1;
    }

    const { error } = await this.deps.client.from("skill_artifacts").insert({
      account_id: job.account_id,
      skill_key: "yield.pricing_teardown",
      title: `Pricing teardown — ${sources.length} competitor${sources.length === 1 ? "" : "s"}`,
      body_md: artifact.bodyMd,
      payload: {
        matrix: artifact.matrix,
        your_position: artifact.yourPosition,
        scenarios: artifact.scenarios,
        spot_check: { checked: checks.length, confirmed },
      },
      evidence_ids: sources.map((source) => source.evidenceId),
      inputs: { competitors: sources.map((source) => ({ id: source.competitorId, pricing_url: source.pricingUrl })) },
      agent_run_id: job.agent_run_id,
    });
    if (error) throw new Error(`Failed to write skill artifact: ${error.message}`);

    await this.markRunCompleted(job, "Pricing teardown completed", {
      skill_key: "yield.pricing_teardown",
      competitors: sources.length,
      spot_check_confirmed: confirmed,
    });
  }

  private async loadCompetitors(accountId: string): Promise<Array<{ id: string; name: string; website_url: string | null }>> {
    const { data, error } = await this.deps.client
      .from("companies")
      .select("id, name, website_url")
      .eq("account_id", accountId)
      .eq("is_competitor", true)
      .order("name", { ascending: true })
      .limit(8);
    if (error) throw new Error(`Failed to load competitors: ${error.message}`);
    return (data ?? []) as Array<{ id: string; name: string; website_url: string | null }>;
  }

  private async loadOwnRevenueItems(accountId: string): Promise<string[]> {
    const { data, error } = await this.deps.client
      .from("canvas_section_versions")
      .select("items, created_at")
      .eq("account_id", accountId)
      .is("competitor_id", null)
      .eq("section_key", "revenue_streams")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Failed to load revenue items: ${error.message}`);
    const items = data?.[0]?.items;
    if (!Array.isArray(items)) return [];
    return items
      .map((entry) => (typeof entry === "string" ? entry : readString(asRecord(entry).text)))
      .filter((text): text is string => Boolean(text));
  }

  private async writeEvidence(job: AgentJob, input: { title: string; sourceUrl: string; excerpt: string }): Promise<string> {
    const { data: existing } = await this.deps.client
      .from("evidence_items")
      .select("id")
      .eq("account_id", job.account_id)
      .eq("source_url", input.sourceUrl)
      .eq("excerpt", input.excerpt)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
    const { data, error } = await this.deps.client
      .from("evidence_items")
      .insert({
        account_id: job.account_id,
        title: input.title,
        source_type: "website",
        source_url: input.sourceUrl,
        excerpt: input.excerpt,
        metadata: { skill_key: "yield.pricing_teardown" },
        created_by_agent_run_id: job.agent_run_id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to write evidence: ${error.message}`);
    return data.id;
  }

  private async loadModelRoutes(accountId: string, taskClasses: string[]): Promise<ModelRoute[]> {
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, params, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .in("task_class", taskClasses)
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load skill model routes: ${error.message}`);
    return (data ?? []) as ModelRoute[];
  }

  private runnerForRoute(route: ModelRoute): AgentRunner {
    if (this.deps.runner) return this.deps.runner;
    if (route.provider === "anthropic") return this.runner;
    if (route.provider === "openrouter") return new OpenRouterChatRunner(this.deps.openRouterApiKey, this.deps.fetch);
    throw new Error(`Unsupported model route provider for skill run: ${route.provider}`);
  }

  private async markRunRunning(job: AgentJob, skillKey: string): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client.from("agent_runs").update({
      status: "running",
      run_type: "skill_run",
      input: { skill_key: skillKey },
      started_at: new Date().toISOString(),
    }).eq("id", job.agent_run_id).eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark skill run running: ${error.message}`);
  }

  private async markRunCompleted(job: AgentJob, summary: string, output: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client.from("agent_runs").update({
      status: "completed",
      summary,
      output,
      completed_at: new Date().toISOString(),
      error: null,
    }).eq("id", job.agent_run_id).eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark skill run completed: ${error.message}`);
  }
}

interface PricingMatrixRow {
  competitor_id: string;
  competitor: string;
  model: string;
  price_points: string[];
  packaging_axes: string[];
  notes: string;
}

interface PricingArtifact {
  bodyMd: string;
  matrix: PricingMatrixRow[];
  yourPosition: string;
  scenarios: Array<{ name: string; description: string }>;
}

function pricingTeardownPrompt(sources: CompetitorPricingSource[], ownItems: string[]): string {
  const sourceBlock = sources
    .map((source, index) => `[${index}] ${source.name} (id=${source.competitorId})\n${source.excerpt.slice(0, 2500)}`)
    .join("\n\n");
  const own = ownItems.length > 0 ? ownItems.map((item) => `- ${item}`).join("\n") : "- (no revenue items recorded yet)";
  return `Normalize the competitor pricing excerpts into a matrix and recommend a pricing strategy. Return JSON only:
{"matrix":[{"competitor_id":"...","competitor":"...","model":"per-seat|usage|tiered|freemium|flat|services|unknown","price_points":["$29/user/mo"],"packaging_axes":["seats","features"],"notes":"..."}],"your_position":"...","recommendation_md":"## Recommendation\\n...","scenarios":[{"name":"...","description":"..."}]}

Your current revenue streams:
${own}

Competitor pricing excerpts:
${sourceBlock}`;
}

export function parsePricingArtifact(text: string, sources: CompetitorPricingSource[]): PricingArtifact | null {
  const unfenced = text.replace(/```(?:json)?/gi, "```").replace(/```/g, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(unfenced.slice(start, end + 1)));
  } catch {
    return null;
  }
  const validIds = new Set(sources.map((source) => source.competitorId));
  const matrix: PricingMatrixRow[] = Array.isArray(parsed.matrix)
    ? parsed.matrix.flatMap((entry) => {
        const record = asRecord(entry);
        const competitorId = readString(record.competitor_id);
        const competitor = readString(record.competitor);
        if (!competitorId || !competitor || !validIds.has(competitorId)) return [];
        return [{
          competitor_id: competitorId,
          competitor,
          model: readString(record.model) ?? "unknown",
          price_points: toStringArray(record.price_points),
          packaging_axes: toStringArray(record.packaging_axes),
          notes: readString(record.notes) ?? "",
        }];
      })
    : [];
  const recommendation = readString(parsed.recommendation_md);
  if (matrix.length === 0 || !recommendation) return null;
  return {
    bodyMd: recommendation,
    matrix,
    yourPosition: readString(parsed.your_position) ?? "",
    scenarios: Array.isArray(parsed.scenarios)
      ? parsed.scenarios.flatMap((entry) => {
          const record = asRecord(entry);
          const name = readString(record.name);
          const description = readString(record.description);
          return name && description ? [{ name, description }] : [];
        })
      : [],
  };
}

/**
 * Live incident 2026-07-05: a skill run failed with "Claude Code process
 * exited with code 1" — the SDK's CLI child died at spawn, not a model
 * refusal (the identical runner+model works in the research verifier). Such
 * process-level failures get ONE immediate in-place retry (the job-level
 * retry re-crawls everything first), and every model step is labeled so the
 * run error names where it died.
 */
const PROCESS_FAILURE = /exited with code|ENOMEM|spawn|ECONNRESET/i;

export async function runModelStep<T>(step: string, attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (first) {
    const firstMessage = first instanceof Error ? first.message : String(first);
    if (!PROCESS_FAILURE.test(firstMessage)) throw new Error(`${step}: ${firstMessage}`);
    try {
      return await attempt();
    } catch (second) {
      const secondMessage = second instanceof Error ? second.message : String(second);
      throw new Error(`${step} failed twice at the process level: "${firstMessage}", retry: "${secondMessage}"`);
    }
  }
}

function joinUrl(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return base;
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function budgetForRoute(route: Pick<ModelRoute, "cost_per_1k_in" | "cost_per_1k_out">): number {
  const input = route.cost_per_1k_in ?? 0.002;
  const output = route.cost_per_1k_out ?? 0.01;
  // $0.25 floor: Claude Agent SDK session overhead (live golden-set finding, PR #18).
  return Math.max(0.25, input * 8 + output * 4);
}

function requiredRoute(routes: ModelRoute[], accountId: string, routeKey: string, taskClass: string): ModelRoute {
  const route = chooseModelRoute(routes.filter((candidate) => candidate.task_class === taskClass), accountId, routeKey, taskClass);
  if (!route) throw new Error(`No model route configured for ${taskClass}/${routeKey}`);
  return route;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
