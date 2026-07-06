import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunner } from "../agent/runner.js";
import { ClaudeAgentRunner, OpenRouterChatRunner } from "../agent/runner.js";
import { loadCompanyScope, type CompanyScope } from "../db/company-scope.js";
import { asRecord } from "../db/json.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import { SECTION_LABELS, type SectionKey } from "../domain/sections.js";
import type { EvidenceCandidate, FeedRuntimeConfig } from "../feeds/types.js";
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

interface CanvasItemSource {
  sectionKey: SectionKey;
  text: string;
  evidenceIds: string[];
  competitorId?: string | null;
  competitorName?: string | null;
}

interface SkillArtifactWrite {
  skillKey: string;
  /** Owning section agent — the artifact summary lands in this agent's context sources. */
  agentKey: string;
  title: string;
  bodyMd: string;
  payload: Record<string, unknown>;
  evidenceIds: string[];
  inputs: Record<string, unknown>;
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

    // Skills read and write only the ACTIVE company's data — competitor
    // lists and canvas items from a previously analyzed company must never
    // feed another company's artifact (owner bug 2026-07-06).
    const scope = await loadCompanyScope(this.deps.client, job.account_id);

    if (skillKey === "yield.pricing_teardown") {
      await this.runPricingTeardown(job, scope);
      return;
    }
    if (skillKey === "compass.avatar_refinement") {
      await this.runAvatarRefinement(job, scope);
      return;
    }
    if (skillKey === "compass.segment_expansion") {
      await this.runSegmentExpansion(job, scope);
      return;
    }
    if (skillKey === "relay.channel_gap_scan") {
      await this.runChannelGapScan(job, scope);
      return;
    }
    if (skillKey === "relay.channel_economics") {
      await this.runChannelEconomics(job, scope);
      return;
    }
    if (skillKey === "forge.differentiator_audit") {
      await this.runDifferentiatorAudit(job, scope);
      return;
    }
    if (skillKey === "forge.proof_gap_scan") {
      await this.runProofGapScan(job, scope);
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
  private async runPricingTeardown(job: AgentJob, scope: CompanyScope): Promise<void> {
    const competitors = await this.loadCompetitors(job.account_id, scope);
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

    const ownItems = await this.loadOwnRevenueItems(job.account_id, scope);
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

    await this.writeSkillArtifact(job, scope, {
      skillKey: "yield.pricing_teardown",
      agentKey: "agent_revenue_streams",
      title: `Pricing teardown — ${sources.length} competitor${sources.length === 1 ? "" : "s"}`,
      bodyMd: artifact.bodyMd,
      payload: {
        matrix: artifact.matrix,
        your_position: artifact.yourPosition,
        scenarios: artifact.scenarios,
        spot_check: { checked: checks.length, confirmed },
      },
      evidenceIds: sources.map((source) => source.evidenceId),
      inputs: { competitors: sources.map((source) => ({ id: source.competitorId, pricing_url: source.pricingUrl })) },
    });

    await this.markRunCompleted(job, "Pricing teardown completed", {
      skill_key: "yield.pricing_teardown",
      competitors: sources.length,
      spot_check_confirmed: confirmed,
    });
  }

  private async runAvatarRefinement(job: AgentJob, scope: CompanyScope): Promise<void> {
    const segments = await this.loadOwnSectionItems(job.account_id, "customer_segments", scope);
    if (segments.length === 0) {
      throw new Error("avatar_refinement requires Customer Segments canvas items first");
    }

    const evidence: Array<{ segment: string; evidence: EvidenceCandidate; evidenceId: string }> = [];
    for (const segment of segments.slice(0, 6)) {
      const result = await this.feedRunner.refresh({
        accountId: job.account_id,
        feedKey: "grok_live_search",
        cacheKey: `avatar_refinement:${job.account_id}:${slug(segment.text)}`,
        companyName: segment.text,
        query: `${segment.text} reviews community forum pain points buying triggers objections`,
      });
      if (result.health !== "ok") continue;
      for (const item of result.evidence.slice(0, 2)) {
        const evidenceId = await this.writeEvidenceCandidate(job, item, "compass.avatar_refinement");
        evidence.push({ segment: segment.text, evidence: item, evidenceId });
      }
    }
    if (evidence.length === 0) {
      throw new Error("avatar_refinement could not find review/community evidence for the current segments");
    }

    const routes = await this.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
    const route = requiredRoute(routes, job.account_id, "skill_run", "skill_run");
    const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");
    const modelResult = await runModelStep(
      `avatar_refinement artifact (${route.provider}/${route.model_name})`,
      () => this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route),
        prompt: avatarRefinementPrompt(segments.map((item) => item.text), evidence),
        systemPrompt: "You build ICP cards from cited evidence only. Quotes must appear verbatim in the supplied excerpts. Return JSON only.",
        mcpServers: {},
        allowedTools: [],
      }),
    );
    const artifact = parseAvatarArtifact(modelResult.resultText, segments.map((item) => item.text));
    if (!artifact) throw new Error("avatar_refinement produced unparseable output; refusing to write an artifact");
    const checked = await this.verifyArtifactClaims(job, verifyRoute, artifact.cards.flatMap((card) =>
      card.pains.map((pain) => ({ claim: `${card.segment}: ${pain.quote}`, excerpt: evidenceForSegment(evidence, card.segment) })),
    ).slice(0, 4), "avatar_refinement");

    await this.writeSkillArtifact(job, scope, {
      skillKey: "compass.avatar_refinement",
      agentKey: "agent_customer_segments",
      title: `Avatar refinement - ${artifact.cards.length} segment${artifact.cards.length === 1 ? "" : "s"}`,
      bodyMd: artifact.bodyMd,
      payload: { cards: artifact.cards, messaging_hooks: artifact.messagingHooks, spot_check: checked },
      evidenceIds: unique(evidence.map((item) => item.evidenceId)),
      inputs: { sections: ["customer_segments"], segments: segments.map((item) => item.text) },
    });
    await this.markRunCompleted(job, "Avatar refinement completed", {
      skill_key: "compass.avatar_refinement",
      cards: artifact.cards.length,
      spot_check_confirmed: checked.confirmed,
    });
  }

  private async runSegmentExpansion(job: AgentJob, scope: CompanyScope): Promise<void> {
    const ownSegments = await this.loadOwnSectionItems(job.account_id, "customer_segments", scope);
    const resources = await this.loadOwnSectionItems(job.account_id, "key_resources", scope);
    const activities = await this.loadOwnSectionItems(job.account_id, "key_activities", scope);
    const competitorSegments = await this.loadCompetitorSectionItems(job.account_id, "customer_segments", scope);
    if (ownSegments.length === 0) throw new Error("segment_expansion requires our Customer Segments canvas items first");
    if (competitorSegments.length === 0) throw new Error("segment_expansion requires competitor Customer Segments research first");

    const routes = await this.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
    const route = requiredRoute(routes, job.account_id, "skill_run", "skill_run");
    const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");
    const modelResult = await runModelStep(
      `segment_expansion artifact (${route.provider}/${route.model_name})`,
      () => this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route),
        prompt: segmentExpansionPrompt(ownSegments, competitorSegments, resources, activities),
        systemPrompt: "You identify adjacent customer segments from competitor canvas evidence only. Do not invent segments. Return JSON only.",
        mcpServers: {},
        allowedTools: [],
      }),
    );
    const artifact = parseSegmentExpansionArtifact(modelResult.resultText);
    if (!artifact) throw new Error("segment_expansion produced unparseable output; refusing to write an artifact");
    const checked = await this.verifyArtifactClaims(job, verifyRoute, artifact.opportunities.map((row) => ({
      claim: `${row.segment}: ${row.competitor_evidence}`,
      excerpt: competitorExcerpt(competitorSegments, row.competitor),
    })).slice(0, 4), "segment_expansion");

    await this.writeSkillArtifact(job, scope, {
      skillKey: "compass.segment_expansion",
      agentKey: "agent_customer_segments",
      title: `Segment expansion scan - ${artifact.opportunities.length} opportunities`,
      bodyMd: artifact.bodyMd,
      payload: { opportunities: artifact.opportunities, spot_check: checked },
      evidenceIds: unique(competitorSegments.flatMap((item) => item.evidenceIds)),
      inputs: {
        sections: ["customer_segments", "key_resources", "key_activities"],
        competitor_items: competitorSegments.length,
      },
    });
    await this.markRunCompleted(job, "Segment expansion scan completed", {
      skill_key: "compass.segment_expansion",
      opportunities: artifact.opportunities.length,
      spot_check_confirmed: checked.confirmed,
    });
  }

  private async runChannelGapScan(job: AgentJob, scope: CompanyScope): Promise<void> {
    const ownChannels = await this.loadOwnSectionItems(job.account_id, "channels", scope);
    const competitorChannels = await this.loadCompetitorSectionItems(job.account_id, "channels", scope);
    if (ownChannels.length === 0) throw new Error("channel_gap_scan requires our Channels canvas items first");
    if (competitorChannels.length === 0) throw new Error("channel_gap_scan requires competitor Channels research first");

    const routes = await this.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
    const route = requiredRoute(routes, job.account_id, "skill_run", "skill_run");
    const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");
    const modelResult = await runModelStep(
      `channel_gap_scan artifact (${route.provider}/${route.model_name})`,
      () => this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route),
        prompt: channelGapPrompt(ownChannels, competitorChannels),
        systemPrompt: "You rank channel gaps from competitor channel evidence. Use effort and impact scores from 1 to 5. Return JSON only.",
        mcpServers: {},
        allowedTools: [],
      }),
    );
    const artifact = parseChannelGapArtifact(modelResult.resultText);
    if (!artifact) throw new Error("channel_gap_scan produced unparseable output; refusing to write an artifact");
    const checked = await this.verifyArtifactClaims(job, verifyRoute, artifact.gaps.map((row) => ({
      claim: `${row.channel}: ${row.competitor_evidence}`,
      excerpt: competitorExcerpt(competitorChannels, row.competitor),
    })).slice(0, 4), "channel_gap_scan");

    await this.writeSkillArtifact(job, scope, {
      skillKey: "relay.channel_gap_scan",
      agentKey: "agent_channels",
      title: `Channel gap scan - ${artifact.gaps.length} ranked channels`,
      bodyMd: artifact.bodyMd,
      payload: { gaps: artifact.gaps, spot_check: checked },
      evidenceIds: unique(competitorChannels.flatMap((item) => item.evidenceIds)),
      inputs: { sections: ["channels"], competitor_items: competitorChannels.length },
    });
    await this.markRunCompleted(job, "Channel gap scan completed", {
      skill_key: "relay.channel_gap_scan",
      gaps: artifact.gaps.length,
      spot_check_confirmed: checked.confirmed,
    });
  }

  private async runChannelEconomics(job: AgentJob, scope: CompanyScope): Promise<void> {
    const ownChannels = await this.loadOwnSectionItems(job.account_id, "channels", scope);
    const competitorChannels = await this.loadCompetitorSectionItems(job.account_id, "channels", scope);
    if (ownChannels.length === 0) throw new Error("channel_economics requires our Channels canvas items first");
    if (competitorChannels.length === 0) throw new Error("channel_economics requires competitor Channels research first");

    const routes = await this.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
    const route = requiredRoute(routes, job.account_id, "skill_run", "skill_run");
    const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");
    const modelResult = await runModelStep(
      `channel_economics artifact (${route.provider}/${route.model_name})`,
      () => this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route),
        prompt: channelEconomicsPrompt(ownChannels, competitorChannels),
        systemPrompt: "You infer CAC posture only from public channel signals. Unknown values must be exactly 'unknown — not published'. Return JSON only.",
        mcpServers: {},
        allowedTools: [],
      }),
    );
    const artifact = parseChannelEconomicsArtifact(modelResult.resultText);
    if (!artifact) throw new Error("channel_economics produced unparseable output; refusing to write an artifact");
    const checked = await this.verifyArtifactClaims(job, verifyRoute, artifact.channels.map((row) => ({
      claim: `${row.channel}: ${row.public_signal}`,
      excerpt: competitorExcerpt(competitorChannels, row.competitor),
    })).slice(0, 4), "channel_economics");

    await this.writeSkillArtifact(job, scope, {
      skillKey: "relay.channel_economics",
      agentKey: "agent_channels",
      title: `Channel economics - ${artifact.channels.length} channel${artifact.channels.length === 1 ? "" : "s"}`,
      bodyMd: artifact.bodyMd,
      payload: { channels: artifact.channels, unknown_note: "unknown — not published", spot_check: checked },
      evidenceIds: unique(competitorChannels.flatMap((item) => item.evidenceIds)),
      inputs: { sections: ["channels"], competitor_items: competitorChannels.length },
    });
    await this.markRunCompleted(job, "Channel economics completed", {
      skill_key: "relay.channel_economics",
      channels: artifact.channels.length,
      spot_check_confirmed: checked.confirmed,
    });
  }

  /**
   * forge.differentiator_audit — classify each own Value Propositions claim
   * against every researched competitor's claims: unique / contested (naming
   * the competitor) / table stakes. Non-unique verdicts are spot-checked
   * against the named competitor's own canvas text.
   */
  private async runDifferentiatorAudit(job: AgentJob, scope: CompanyScope): Promise<void> {
    const ownClaims = await this.loadOwnSectionItems(job.account_id, "value_propositions", scope);
    const competitorClaims = await this.loadCompetitorSectionItems(job.account_id, "value_propositions", scope);
    if (ownClaims.length === 0) throw new Error("differentiator_audit requires our Value Propositions canvas items first");
    if (competitorClaims.length === 0) throw new Error("differentiator_audit requires competitor Value Propositions research first");

    const routes = await this.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
    const route = requiredRoute(routes, job.account_id, "skill_run", "skill_run");
    const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");
    const modelResult = await runModelStep(
      `differentiator_audit artifact (${route.provider}/${route.model_name})`,
      () => this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route),
        prompt: differentiatorAuditPrompt(ownClaims, competitorClaims),
        systemPrompt: "You judge differentiation strictly from the provided canvas claims. A claim is contested only when a NAMED competitor's provided text supports it. Return JSON only.",
        mcpServers: {},
        allowedTools: [],
      }),
    );
    const artifact = parseDifferentiatorArtifact(modelResult.resultText, ownClaims.map((item) => item.text));
    if (!artifact) throw new Error("differentiator_audit produced unparseable output; refusing to write an artifact");

    // Only non-unique verdicts assert something about a competitor — those
    // are the checkable claims. An all-unique audit has nothing to spot-check.
    const checks = artifact.rows
      .filter((row) => row.verdict !== "unique" && row.competitor)
      .map((row) => ({
        claim: `${row.competitor} also claims: ${row.competitor_evidence}`,
        excerpt: competitorExcerpt(competitorClaims, row.competitor ?? ""),
      }));
    const checked = checks.length > 0
      ? await this.verifyArtifactClaims(job, verifyRoute, checks.slice(0, 4), "differentiator_audit")
      : { checked: 0, confirmed: 0 };

    const contested = artifact.rows.filter((row) => row.verdict === "contested").length;
    await this.writeSkillArtifact(job, scope, {
      skillKey: "forge.differentiator_audit",
      agentKey: "agent_value_propositions",
      title: `Differentiator audit — ${artifact.rows.length} claims, ${contested} contested`,
      bodyMd: artifact.bodyMd,
      payload: { rows: artifact.rows, spot_check: checked },
      evidenceIds: unique(competitorClaims.flatMap((item) => item.evidenceIds)),
      inputs: { sections: ["value_propositions"], competitor_items: competitorClaims.length },
    });
    await this.markRunCompleted(job, "Differentiator audit completed", {
      skill_key: "forge.differentiator_audit",
      claims: artifact.rows.length,
      contested,
      spot_check_confirmed: checked.confirmed,
    });
  }

  /**
   * forge.proof_gap_scan — pure database analysis: a Value Propositions item
   * with no linked evidence or an "Assumption:" label is a proof gap. The
   * detection is deterministic (nothing for a verifier to check against);
   * the model only writes the per-gap evidence-sourcing suggestions. Each gap
   * also lands on the Gap Register, superseding this skill's prior open rows
   * so re-runs never duplicate.
   */
  private async runProofGapScan(job: AgentJob, scope: CompanyScope): Promise<void> {
    const ownClaims = await this.loadOwnSectionItems(job.account_id, "value_propositions", scope);
    if (ownClaims.length === 0) throw new Error("proof_gap_scan requires our Value Propositions canvas items first");

    const detected = ownClaims.flatMap((item) => {
      const assumption = ASSUMPTION_PREFIX.test(item.text);
      if (!assumption && item.evidenceIds.length > 0) return [];
      return [{ claim: item.text, reason: assumption ? ("assumption" as const) : ("no_evidence" as const) }];
    });

    if (detected.length === 0) {
      await this.writeSkillArtifact(job, scope, {
        skillKey: "forge.proof_gap_scan",
        agentKey: "agent_value_propositions",
        title: "Proof gap scan — no gaps: every claim carries evidence",
        bodyMd: `## Proof gap scan\n\nAll ${ownClaims.length} Value Propositions items carry linked evidence and none is labeled as an assumption. Nothing to prove right now — re-run after the section changes.`,
        payload: { gaps: [], detection: "deterministic", claims_scanned: ownClaims.length },
        evidenceIds: unique(ownClaims.flatMap((item) => item.evidenceIds)),
        inputs: { sections: ["value_propositions"], claims_scanned: ownClaims.length },
      });
      await this.markRunCompleted(job, "Proof gap scan completed — no gaps", {
        skill_key: "forge.proof_gap_scan",
        gaps: 0,
        claims_scanned: ownClaims.length,
      });
      return;
    }

    const routes = await this.loadModelRoutes(job.account_id, ["skill_run"]);
    const route = requiredRoute(routes, job.account_id, "skill_run", "skill_run");
    const modelResult = await runModelStep(
      `proof_gap_scan suggestions (${route.provider}/${route.model_name})`,
      () => this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 12,
        maxBudgetUsd: budgetForRoute(route),
        prompt: proofGapScanPrompt(detected),
        systemPrompt: "You suggest ONE concrete, obtainable evidence source per unproven claim (a page to crawl, an owner document, a metric, a customer quote). Return JSON only.",
        mcpServers: {},
        allowedTools: [],
      }),
    );
    const artifact = parseProofGapArtifact(modelResult.resultText, detected);
    if (!artifact) throw new Error("proof_gap_scan produced unparseable output; refusing to write an artifact");

    await this.writeProofGaps(job, scope, artifact.gaps);
    await this.writeSkillArtifact(job, scope, {
      skillKey: "forge.proof_gap_scan",
      agentKey: "agent_value_propositions",
      title: `Proof gap scan — ${artifact.gaps.length} unproven claim${artifact.gaps.length === 1 ? "" : "s"}`,
      bodyMd: artifact.bodyMd,
      payload: { gaps: artifact.gaps, detection: "deterministic", claims_scanned: ownClaims.length },
      evidenceIds: [],
      inputs: { sections: ["value_propositions"], claims_scanned: ownClaims.length },
    });
    await this.markRunCompleted(job, "Proof gap scan completed", {
      skill_key: "forge.proof_gap_scan",
      gaps: artifact.gaps.length,
      claims_scanned: ownClaims.length,
    });
  }

  /** Re-runs supersede this skill's prior open register rows, then write fresh ones. */
  private async writeProofGaps(job: AgentJob, scope: CompanyScope, gaps: ProofGapRow[]): Promise<void> {
    const { error: supersedeError } = await this.deps.client
      .from("gaps")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("account_id", job.account_id)
      .eq("gap_type", "missing_data")
      .like("title", "Proof gap:%")
      .in("business_context_version_id", scope.contextIds)
      .in("status", ["open", "acknowledged"]);
    if (supersedeError) throw new Error(`Failed to supersede prior proof gaps: ${supersedeError.message}`);

    const rows = gaps.map((gap) => ({
      account_id: job.account_id,
      business_context_version_id: scope.activeContextId,
      title: `Proof gap: ${truncateText(gap.claim, 90)}`,
      description: gap.reason === "assumption"
        ? "This item is labeled as an assumption — it has never been verified against evidence."
        : "This item has no linked evidence behind it.",
      gap_type: "missing_data",
      severity: "medium",
      affected_sections: ["value_propositions"],
      recommended_action: `${gap.suggested_source} — ${gap.how_to_get_it}`,
      created_by_agent_run_id: job.agent_run_id,
    }));
    const { error } = await this.deps.client.from("gaps").insert(rows);
    if (error) throw new Error(`Failed to write proof gaps to the register: ${error.message}`);
  }

  private async loadCompetitors(accountId: string, scope: CompanyScope): Promise<Array<{ id: string; name: string; website_url: string | null }>> {
    const { data, error } = await this.deps.client
      .from("companies")
      .select("id, name, website_url")
      .eq("account_id", accountId)
      .eq("is_competitor", true)
      .in("business_context_version_id", scope.contextIds)
      .order("name", { ascending: true })
      .limit(8);
    if (error) throw new Error(`Failed to load competitors: ${error.message}`);
    return (data ?? []) as Array<{ id: string; name: string; website_url: string | null }>;
  }

  private async loadOwnSectionItems(accountId: string, sectionKey: SectionKey, scope: CompanyScope): Promise<CanvasItemSource[]> {
    const { data, error } = await this.deps.client
      .from("canvas_section_versions")
      .select("section_key, items, created_at")
      .eq("account_id", accountId)
      .is("competitor_id", null)
      .in("business_context_version_id", scope.contextIds)
      .eq("section_key", sectionKey)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Failed to load ${SECTION_LABELS[sectionKey]} items: ${error.message}`);
    return flattenCanvasItems(data ?? [], sectionKey);
  }

  private async loadCompetitorSectionItems(accountId: string, sectionKey: SectionKey, scope: CompanyScope): Promise<CanvasItemSource[]> {
    const { data, error } = await this.deps.client
      .from("canvas_section_versions")
      .select("section_key, competitor_id, items, created_at, companies!canvas_section_versions_competitor_id_fkey(name)")
      .eq("account_id", accountId)
      .not("competitor_id", "is", null)
      .in("business_context_version_id", scope.contextIds)
      .eq("section_key", sectionKey)
      .order("created_at", { ascending: false })
      .limit(24);
    if (error) throw new Error(`Failed to load competitor ${SECTION_LABELS[sectionKey]} items: ${error.message}`);
    return flattenCanvasItems(data ?? [], sectionKey);
  }

  private async loadOwnRevenueItems(accountId: string, scope: CompanyScope): Promise<string[]> {
    const { data, error } = await this.deps.client
      .from("canvas_section_versions")
      .select("items, created_at")
      .eq("account_id", accountId)
      .is("competitor_id", null)
      .in("business_context_version_id", scope.contextIds)
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

  private async writeEvidenceCandidate(job: AgentJob, input: EvidenceCandidate, skillKey: string): Promise<string> {
    const excerpt = input.excerpt ?? "";
    const sourceUrl = input.sourceUrl ?? `${skillKey}:${input.title}`;
    const { data: existing } = await this.deps.client
      .from("evidence_items")
      .select("id")
      .eq("account_id", job.account_id)
      .eq("source_url", sourceUrl)
      .eq("excerpt", excerpt)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
    const { data, error } = await this.deps.client
      .from("evidence_items")
      .insert({
        account_id: job.account_id,
        title: input.title,
        source_type: input.sourceType,
        source_name: input.sourceName ?? null,
        source_url: sourceUrl,
        excerpt,
        metadata: { ...(input.metadata ?? {}), skill_key: skillKey },
        created_by_agent_run_id: job.agent_run_id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to write skill evidence: ${error.message}`);
    return data.id;
  }

  private async writeSkillArtifact(job: AgentJob, scope: CompanyScope, artifact: SkillArtifactWrite): Promise<void> {
    const { error } = await this.deps.client.from("skill_artifacts").insert({
      account_id: job.account_id,
      business_context_version_id: scope.activeContextId,
      skill_key: artifact.skillKey,
      title: artifact.title,
      body_md: artifact.bodyMd,
      payload: artifact.payload,
      evidence_ids: artifact.evidenceIds,
      inputs: artifact.inputs,
      agent_run_id: job.agent_run_id,
    });
    if (error) throw new Error(`Failed to write skill artifact: ${error.message}`);
    // Finished work compounds: the owning agent's next chat turn should
    // already know this artifact exists. Best-effort — the artifact (the
    // contract) is written; a failed note must not fail the run.
    try {
      await this.syncArtifactContextNote(job, artifact);
    } catch (noteError) {
      console.error(`artifact context note failed for ${artifact.skillKey}:`, noteError);
    }
  }

  /**
   * Phase F item 3: mirror the artifact into the owning section agent's
   * context sources as a summary note (config.source = "skill_artifact").
   * Keeps only the 5 newest artifact-sourced notes per profile; user-created
   * sources are never touched.
   */
  private async syncArtifactContextNote(job: AgentJob, artifact: SkillArtifactWrite): Promise<void> {
    const { data: profiles, error: profileError } = await this.deps.client
      .from("agent_profiles")
      .select("id, account_id")
      .eq("agent_key", artifact.agentKey)
      .or(`account_id.eq.${job.account_id},account_id.is.null`)
      .order("account_id", { ascending: false, nullsFirst: false })
      .limit(1);
    if (profileError) throw new Error(profileError.message);
    const profileId = (profiles?.[0] as { id: string } | undefined)?.id;
    if (!profileId) return;

    const { error: insertError } = await this.deps.client.from("context_sources").insert({
      account_id: job.account_id,
      agent_profile_id: profileId,
      type: "note",
      name: truncateText(`Artifact: ${artifact.title}`, 120),
      config: {
        text: truncateText(artifact.bodyMd, 1200),
        source: "skill_artifact",
        skill_key: artifact.skillKey,
      },
      enabled: true,
    });
    if (insertError) throw new Error(insertError.message);

    const { data: notes, error: listError } = await this.deps.client
      .from("context_sources")
      .select("id, created_at")
      .eq("account_id", job.account_id)
      .eq("agent_profile_id", profileId)
      .eq("type", "note")
      .eq("config->>source", "skill_artifact")
      .order("created_at", { ascending: false });
    if (listError) throw new Error(listError.message);
    const stale = ((notes ?? []) as Array<{ id: string }>).slice(5).map((note) => note.id);
    if (stale.length > 0) {
      const { error: deleteError } = await this.deps.client
        .from("context_sources")
        .delete()
        .eq("account_id", job.account_id)
        .in("id", stale);
      if (deleteError) throw new Error(deleteError.message);
    }
  }

  private async verifyArtifactClaims(
    job: AgentJob,
    verifyRoute: ModelRoute,
    checks: Array<{ claim: string; excerpt: string }>,
    label: string,
  ): Promise<{ checked: number; confirmed: number }> {
    let confirmed = 0;
    const usable = checks.filter((check) => check.claim.trim() && check.excerpt.trim()).slice(0, 4);
    if (usable.length === 0) throw new Error(`${label} has no evidence-backed claims to verify`);
    for (const check of usable) {
      const verdict = await runModelStep(
        `${label} verifier spot-check (${verifyRoute.provider}/${verifyRoute.model_name})`,
        () => verifyClaimAgainstExcerpt(this.runnerForRoute(verifyRoute), verifyRoute, check.claim, check.excerpt),
      );
      if (verdict.status === "contradicted") {
        throw new Error(`${label} spot-check contradicted: ${verdict.reason}`);
      }
      if (verdict.status === "confirmed") confirmed += 1;
    }
    return { checked: usable.length, confirmed };
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

interface AvatarArtifact {
  bodyMd: string;
  cards: Array<{
    segment: string;
    who: string;
    pains: Array<{ quote: string; interpretation: string }>;
    buying_triggers: string[];
    disqualifiers: string[];
    messaging_hooks: string[];
  }>;
  messagingHooks: string[];
}

interface SegmentExpansionArtifact {
  bodyMd: string;
  opportunities: Array<{
    segment: string;
    competitor: string;
    competitor_evidence: string;
    fit_score: number;
    fit_rationale: string;
    recommended_probe: string;
  }>;
}

interface ChannelGapArtifact {
  bodyMd: string;
  gaps: Array<{
    channel: string;
    competitor: string;
    competitor_evidence: string;
    effort: number;
    impact: number;
    recommendation: string;
  }>;
}

interface ChannelEconomicsArtifact {
  bodyMd: string;
  channels: Array<{
    channel: string;
    competitor: string;
    public_signal: string;
    cac_posture: string;
    confidence: number;
    notes: string;
  }>;
}

interface DifferentiatorRow {
  claim: string;
  verdict: "unique" | "contested" | "table_stakes";
  competitor: string | null;
  competitor_evidence: string;
  basis: string;
}

interface DifferentiatorArtifact {
  bodyMd: string;
  rows: DifferentiatorRow[];
}

interface ProofGapRow {
  claim: string;
  reason: "assumption" | "no_evidence";
  suggested_source: string;
  how_to_get_it: string;
}

interface ProofGapArtifact {
  bodyMd: string;
  gaps: ProofGapRow[];
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

function avatarRefinementPrompt(segments: string[], evidence: Array<{ segment: string; evidence: EvidenceCandidate }>): string {
  return `Build ICP cards for the current Customer Segments. Return JSON only:
{"cards":[{"segment":"...","who":"...","pains":[{"quote":"verbatim quote from evidence","interpretation":"..."}],"buying_triggers":["..."],"disqualifiers":["..."],"messaging_hooks":["..."]}],"messaging_hooks":["..."],"body_md":"## What changed\\n..."}

Current segments:
${segments.map((segment) => `- ${segment}`).join("\n")}

Evidence:
${evidence.map((entry, index) => `[${index}] segment=${entry.segment}\n${entry.evidence.title}\n${entry.evidence.excerpt ?? ""}`).join("\n\n")}`;
}

function segmentExpansionPrompt(
  ownSegments: CanvasItemSource[],
  competitorSegments: CanvasItemSource[],
  resources: CanvasItemSource[],
  activities: CanvasItemSource[],
): string {
  return `Find adjacent customer segments competitors serve that our Customer Segments do not mention. Score fit from 1 to 5 using our Key Resources and Key Activities. Return JSON only:
{"opportunities":[{"segment":"...","competitor":"...","competitor_evidence":"short evidence-backed phrase","fit_score":4,"fit_rationale":"...","recommended_probe":"..."}],"body_md":"## Expansion shortlist\\n..."}

Our current segments:
${formatItems(ownSegments)}

Our Key Resources:
${formatItems(resources)}

Our Key Activities:
${formatItems(activities)}

Competitor customer segments:
${formatItems(competitorSegments)}`;
}

function channelGapPrompt(ownChannels: CanvasItemSource[], competitorChannels: CanvasItemSource[]): string {
  return `Compare competitor channels against ours. Rank channel gaps by effort and impact, 1 to 5. Return JSON only:
{"gaps":[{"channel":"...","competitor":"...","competitor_evidence":"short evidence-backed phrase","effort":2,"impact":5,"recommendation":"..."}],"body_md":"## Channel gaps\\n..."}

Our channels:
${formatItems(ownChannels)}

Competitor channels:
${formatItems(competitorChannels)}`;
}

function differentiatorAuditPrompt(ownClaims: CanvasItemSource[], competitorClaims: CanvasItemSource[]): string {
  return `Classify EVERY one of our Value Propositions claims against the competitor claims below:
- "unique": no competitor's provided text supports the same value.
- "contested": a NAMED competitor's provided text claims substantially the same value — set "competitor" to that name and quote the supporting phrase in "competitor_evidence".
- "table_stakes": most competitors claim it; treat it as a category baseline, name the clearest example.
Return JSON only:
{"rows":[{"claim":"<verbatim one of our claims>","verdict":"unique|contested|table_stakes","competitor":"name or null","competitor_evidence":"short phrase from that competitor's text, empty for unique","basis":"one-sentence reasoning"}],"body_md":"## Differentiation read\\n..."}

Our Value Propositions claims (classify each, verbatim):
${formatItems(ownClaims)}

Competitor Value Propositions claims:
${formatItems(competitorClaims)}`;
}

function proofGapScanPrompt(detected: Array<{ claim: string; reason: "assumption" | "no_evidence" }>): string {
  return `For each unproven Value Propositions claim below, suggest ONE concrete evidence source and how to obtain it. Return JSON only:
{"gaps":[{"claim":"<verbatim claim from the list>","suggested_source":"e.g. customer case study page, pricing page, usage metric, founder document","how_to_get_it":"one imperative sentence"}],"body_md":"## Proof plan\\n..."}

Unproven claims:
${detected.map((entry) => `- ${entry.claim} (${entry.reason === "assumption" ? "labeled as an assumption" : "no linked evidence"})`).join("\n")}`;
}

function channelEconomicsPrompt(ownChannels: CanvasItemSource[], competitorChannels: CanvasItemSource[]): string {
  return `Estimate CAC posture per channel only from public channel signals. If spend, CAC, conversion, or efficiency is not explicitly published, use exactly "unknown — not published". Return JSON only:
{"channels":[{"channel":"...","competitor":"...","public_signal":"evidence-backed public signal","cac_posture":"paid-heavy|partner-led|organic-led|unknown — not published","confidence":0.55,"notes":"..."}],"body_md":"## Channel economics\\n..."}

Our channels:
${formatItems(ownChannels)}

Competitor channel evidence:
${formatItems(competitorChannels)}`;
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

export function parseAvatarArtifact(text: string, allowedSegments: string[]): AvatarArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowed = new Set(allowedSegments);
  const cards = Array.isArray(parsed.cards)
    ? parsed.cards.flatMap((entry) => {
        const record = asRecord(entry);
        const segment = readString(record.segment);
        const who = readString(record.who);
        if (!segment || !who || !allowed.has(segment)) return [];
        const pains = Array.isArray(record.pains)
          ? record.pains.flatMap((pain) => {
              const painRecord = asRecord(pain);
              const quote = readString(painRecord.quote);
              const interpretation = readString(painRecord.interpretation);
              return quote && interpretation ? [{ quote, interpretation }] : [];
            })
          : [];
        if (pains.length === 0) return [];
        return [{
          segment,
          who,
          pains,
          buying_triggers: toStringArray(record.buying_triggers),
          disqualifiers: toStringArray(record.disqualifiers),
          messaging_hooks: toStringArray(record.messaging_hooks),
        }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  if (cards.length === 0 || !bodyMd) return null;
  return { bodyMd, cards, messagingHooks: toStringArray(parsed.messaging_hooks) };
}

export function parseSegmentExpansionArtifact(text: string): SegmentExpansionArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const opportunities = Array.isArray(parsed.opportunities)
    ? parsed.opportunities.flatMap((entry) => {
        const row = asRecord(entry);
        const segment = readString(row.segment);
        const competitor = readString(row.competitor);
        const competitorEvidence = readString(row.competitor_evidence);
        const fitRationale = readString(row.fit_rationale);
        const recommendedProbe = readString(row.recommended_probe);
        if (!segment || !competitor || !competitorEvidence || !fitRationale || !recommendedProbe) return [];
        return [{
          segment,
          competitor,
          competitor_evidence: competitorEvidence,
          fit_score: boundedScore(row.fit_score),
          fit_rationale: fitRationale,
          recommended_probe: recommendedProbe,
        }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  return opportunities.length > 0 && bodyMd ? { bodyMd, opportunities } : null;
}

export function parseChannelGapArtifact(text: string): ChannelGapArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const gaps = Array.isArray(parsed.gaps)
    ? parsed.gaps.flatMap((entry) => {
        const row = asRecord(entry);
        const channel = readString(row.channel);
        const competitor = readString(row.competitor);
        const competitorEvidence = readString(row.competitor_evidence);
        const recommendation = readString(row.recommendation);
        if (!channel || !competitor || !competitorEvidence || !recommendation) return [];
        return [{
          channel,
          competitor,
          competitor_evidence: competitorEvidence,
          effort: boundedScore(row.effort),
          impact: boundedScore(row.impact),
          recommendation,
        }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  return gaps.length > 0 && bodyMd ? { bodyMd, gaps } : null;
}

export function parseDifferentiatorArtifact(text: string, allowedClaims: string[]): DifferentiatorArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const allowed = new Set(allowedClaims);
  const rows: DifferentiatorRow[] = Array.isArray(parsed.rows)
    ? parsed.rows.flatMap((entry) => {
        const row = asRecord(entry);
        const claim = readString(row.claim);
        const verdict = readString(row.verdict);
        const basis = readString(row.basis);
        // Claims must be OUR claims verbatim — the model may not invent items.
        if (!claim || !basis || !allowed.has(claim)) return [];
        if (verdict !== "unique" && verdict !== "contested" && verdict !== "table_stakes") return [];
        const competitor = readString(row.competitor) ?? null;
        const competitorEvidence = readString(row.competitor_evidence) ?? "";
        // A non-unique verdict without a named competitor is an unsupported
        // assertion — refuse the row rather than ship a vague "someone".
        if (verdict !== "unique" && (!competitor || !competitorEvidence)) return [];
        return [{
          claim,
          verdict,
          competitor: verdict === "unique" ? null : competitor,
          competitor_evidence: verdict === "unique" ? "" : competitorEvidence,
          basis,
        }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  return rows.length > 0 && bodyMd ? { bodyMd, rows } : null;
}

export function parseProofGapArtifact(
  text: string,
  detected: Array<{ claim: string; reason: "assumption" | "no_evidence" }>,
): ProofGapArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const reasonByClaim = new Map(detected.map((entry) => [entry.claim, entry.reason]));
  const gaps: ProofGapRow[] = Array.isArray(parsed.gaps)
    ? parsed.gaps.flatMap((entry) => {
        const row = asRecord(entry);
        const claim = readString(row.claim);
        const suggestedSource = readString(row.suggested_source);
        const howToGetIt = readString(row.how_to_get_it);
        const reason = claim ? reasonByClaim.get(claim) : undefined;
        if (!claim || !suggestedSource || !howToGetIt || !reason) return [];
        return [{ claim, reason, suggested_source: suggestedSource, how_to_get_it: howToGetIt }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  // Every deterministically detected gap must come back with a suggestion —
  // a partial answer would silently drop register rows.
  return gaps.length === detected.length && bodyMd ? { bodyMd, gaps } : null;
}

export function parseChannelEconomicsArtifact(text: string): ChannelEconomicsArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const channels = Array.isArray(parsed.channels)
    ? parsed.channels.flatMap((entry) => {
        const row = asRecord(entry);
        const channel = readString(row.channel);
        const competitor = readString(row.competitor);
        const publicSignal = readString(row.public_signal);
        const cacPosture = readString(row.cac_posture);
        const notes = readString(row.notes);
        if (!channel || !competitor || !publicSignal || !cacPosture || !notes) return [];
        return [{
          channel,
          competitor,
          public_signal: publicSignal,
          cac_posture: cacPosture,
          confidence: boundedConfidence(row.confidence),
          notes,
        }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  return channels.length > 0 && bodyMd ? { bodyMd, channels } : null;
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

function parseJsonObject(text: string): Record<string, unknown> | null {
  const unfenced = text.replace(/```(?:json)?/gi, "```").replace(/```/g, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return asRecord(JSON.parse(unfenced.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function flattenCanvasItems(rows: unknown[], defaultSectionKey: SectionKey): CanvasItemSource[] {
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const sectionKey = (readString(record.section_key) as SectionKey | undefined) ?? defaultSectionKey;
    const competitorId = readString(record.competitor_id) ?? null;
    const company = asRecord(record.companies);
    const competitorName = readString(company.name) ?? competitorId;
    const items = Array.isArray(record.items) ? record.items : [];
    return items.flatMap((item) => {
      const itemRecord = asRecord(item);
      const text = typeof item === "string" ? item : readString(itemRecord.text);
      if (!text) return [];
      return [{
        sectionKey,
        text,
        evidenceIds: toStringArray(itemRecord.evidence_ids),
        competitorId,
        competitorName,
      }];
    });
  });
}

function formatItems(items: CanvasItemSource[]): string {
  return items.length > 0
    ? items.map((item) => `- ${item.competitorName ? `${item.competitorName}: ` : ""}${item.text}`).join("\n")
    : "- (none recorded)";
}

function evidenceForSegment(evidence: Array<{ segment: string; evidence: EvidenceCandidate }>, segment: string): string {
  return evidence
    .filter((entry) => entry.segment === segment)
    .map((entry) => entry.evidence.excerpt ?? "")
    .join("\n\n");
}

function competitorExcerpt(items: CanvasItemSource[], competitor: string): string {
  return items
    .filter((item) => (item.competitorName ?? "").toLowerCase() === competitor.toLowerCase())
    .map((item) => item.text)
    .join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

// Mirror of src/lib/assumption.ts — the "Assumption:" prefix is data.
const ASSUMPTION_PREFIX = /^assumption[:\-–—]/i;

function truncateText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "segment";
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function boundedScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.min(5, Math.max(1, Math.round(score)));
}

function boundedConfidence(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0.5;
  return Math.min(1, Math.max(0, score));
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
