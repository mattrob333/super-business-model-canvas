import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunRequest, AgentRunResult } from "../../agent/runner.js";
import type { CompanyScope } from "../../db/company-scope.js";
import type { SectionKey } from "../../domain/sections.js";
import type { FeedRefreshRequest } from "../../feeds/feed-runner.js";
import type { FeedRunResult } from "../../feeds/types.js";
import type { AgentJob } from "../../queue/types.js";

/**
 * The skill toolkit (Phase G): the contract between SkillRunHandler and
 * standalone skill modules under worker/src/jobs/skills/. New skills live in
 * their OWN file, receive this toolkit, and register in skills/index.ts —
 * one line of shared-file churn per skill, so many skills can be built in
 * parallel without touching skill-run.ts.
 *
 * Every method is backed by the exact same private helpers the six built-in
 * skills use (company scoping, verifier gates, artifact + context-note
 * wiring included) — a registered skill cannot bypass the invariants.
 */

export interface ModelRoute {
  account_id?: string | null;
  route_key?: string | null;
  task_class?: string | null;
  provider: string;
  model_name: string;
  params?: Record<string, unknown> | null;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

export interface CanvasItemSource {
  sectionKey: SectionKey;
  text: string;
  evidenceIds: string[];
  competitorId?: string | null;
  competitorName?: string | null;
}

export interface SkillArtifactWrite {
  skillKey: string;
  /** Owning section agent — the artifact summary lands in this agent's context sources. */
  agentKey: string;
  title: string;
  bodyMd: string;
  payload: Record<string, unknown>;
  evidenceIds: string[];
  inputs: Record<string, unknown>;
}

export interface SkillToolkit {
  /** Service-role client. Every query MUST be account-scoped and company-scoped. */
  client: SupabaseClient;

  /** Latest own-canvas items for a section, confined to the active company's context chain. */
  loadOwnSectionItems(accountId: string, sectionKey: SectionKey, scope: CompanyScope): Promise<CanvasItemSource[]>;
  /** Latest competitor-canvas items for a section, confined to the active company's context chain. */
  loadCompetitorSectionItems(accountId: string, sectionKey: SectionKey, scope: CompanyScope): Promise<CanvasItemSource[]>;
  /** The active company's researched competitor entities. */
  loadCompetitors(accountId: string, scope: CompanyScope): Promise<Array<{ id: string; name: string; website_url: string | null }>>;

  /** Cached feed fetch (firecrawl_scrape, web_search, ...). */
  refreshFeed(request: FeedRefreshRequest): Promise<FeedRunResult>;

  /** Model routes for the given task classes (account overrides win). */
  loadModelRoutes(accountId: string, taskClasses: string[]): Promise<ModelRoute[]>;
  requiredRoute(routes: ModelRoute[], accountId: string, routeKey: string, taskClass: string): ModelRoute;
  budgetForRoute(route: Pick<ModelRoute, "cost_per_1k_in" | "cost_per_1k_out">): number;
  /** One labeled model step with the process-failure retry policy. */
  runModel(stepLabel: string, route: ModelRoute, request: Omit<AgentRunRequest, "model" | "modelParams">): Promise<AgentRunResult>;

  /** Verifier spot-check (up to 4 checks); throws on a contradicted claim. */
  verifyArtifactClaims(
    job: AgentJob,
    verifyRoute: ModelRoute,
    checks: Array<{ claim: string; excerpt: string }>,
    label: string,
  ): Promise<{ checked: number; confirmed: number }>;

  /** Latest artifact this skill family already produced for the active company (synthesis input). */
  loadLatestArtifact(accountId: string, scope: CompanyScope, skillKey: string): Promise<{ title: string; body_md: string; payload: Record<string, unknown> } | null>;

  /** Evidence row (deduped account+source+excerpt); returns evidence id. */
  writeEvidence(job: AgentJob, input: { title: string; sourceUrl: string; excerpt: string }): Promise<string>;
  /** The one way to ship output: artifact row + owning agent's context note. */
  writeSkillArtifact(job: AgentJob, scope: CompanyScope, artifact: SkillArtifactWrite): Promise<void>;
  markRunCompleted(job: AgentJob, summary: string, output: Record<string, unknown>): Promise<void>;

  /** Lenient JSON-object extraction from a model reply (fences stripped). */
  parseJsonObject(text: string): Record<string, unknown> | null;
  formatItems(items: CanvasItemSource[]): string;
  competitorExcerpt(items: CanvasItemSource[], competitor: string): string;
  unique(values: string[]): string[];
  truncateText(text: string, max: number): string;
}

/** A registered skill: everything it needs arrives as arguments. */
export type SkillRun = (toolkit: SkillToolkit, job: AgentJob, scope: CompanyScope) => Promise<void>;
