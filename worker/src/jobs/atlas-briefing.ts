import type { SupabaseClient } from "@supabase/supabase-js";
import { createAgentHooks } from "../agent/guardrails.js";
import { ClaudeAgentRunner, type AgentRunner } from "../agent/runner.js";
import { loadCompanyScope, type CompanyScope } from "../db/company-scope.js";
import { asRecord } from "../db/json.js";
import { loadCoverageReport } from "../domain/coverage.js";
import { isSectionKey, SECTION_KEYS, SECTION_LABELS, sectionKeyForAgentKey, type SectionKey } from "../domain/sections.js";
import type { AgentJob } from "../queue/types.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";

/**
 * Atlas "State of the Union" briefing (spec 12). One deterministic context
 * assembly, one model call, one validated payload — the model narrates only
 * what the queries put in front of it (rule B1), and the coverage/changes
 * fields never come from the model at all (they are computed here, so the
 * database is the referee — rule B3).
 */

export type CoverageState = "verified" | "assumed" | "empty";

export interface CoverageEntry {
  section_key: SectionKey;
  state: CoverageState;
  items: number;
}

export interface GapSummary {
  total: number;
  bySeverity: Record<string, number>;
  topTitles: string[];
}

export interface ImplementedSkill {
  skill_key: string;
  agent_key: string;
  title: string;
}

interface ArtifactSummary {
  title: string;
  skill_key: string;
  created_at: string;
}

interface CompanyBrief {
  company_name: string | null;
  industry: string | null;
  summary: string | null;
}

interface CompetitorSummary {
  name: string;
  website_url: string | null;
}

interface PreviousBriefing {
  coverage: Map<SectionKey, CoverageState>;
  generatedAt: string | null;
  openGaps: number | null;
}

interface PositionClaim {
  claim: string;
  basis: string;
}

interface Directive {
  room: SectionKey | null;
  skill_key: string | null;
  action: string;
  why: string;
}

export interface BrainCoverageSummary {
  filled: number;
  total: number;
  top_gaps: Array<{ path: string; title: string; score: number; reason: "empty" | "stale" }>;
}

export interface AtlasBriefingPayload {
  kind: "atlas_briefing_v1";
  headline: string;
  position: PositionClaim[];
  coverage: CoverageEntry[];
  /** AT-5 coverage engine: brain-slot coverage — computed, never model-authored. */
  brain_coverage: BrainCoverageSummary | null;
  changes: string[];
  directive: Directive;
  watchouts: string[];
  generated_at: string;
  model: string;
}

interface ModelRoute {
  account_id?: string | null;
  route_key?: string | null;
  task_class?: string | null;
  provider: string;
  model_name: string;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

export interface AtlasBriefingDependencies {
  client: SupabaseClient;
  runner?: AgentRunner;
}

export class AtlasBriefingHandler {
  private readonly runner: AgentRunner;

  constructor(private readonly deps: AtlasBriefingDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
  }

  async handle(job: AgentJob): Promise<void> {
    const accountId = job.account_id;

    // Deterministic context assembly — plain scoped queries, no model. Every
    // read is confined to the ACTIVE company's context chain so briefings for
    // Salesforce never narrate Tier4's canvas (owner bug 2026-07-06).
    const scope = await loadCompanyScope(this.deps.client, accountId);
    const coverage = await loadSectionCoverage(this.deps.client, accountId, scope);
    const brief = await this.loadCompanyBrief(accountId, scope);
    const competitors = await this.loadCompetitors(accountId, scope);
    const gaps = await loadGapSummary(this.deps.client, accountId, scope);
    const artifacts = await this.loadRecentArtifacts(accountId, scope);
    const skills = await loadImplementedSkills(this.deps.client);
    const previous = await this.loadPreviousBriefing(accountId, scope);
    const changes = computeChanges(coverage, gaps, artifacts, previous);
    const brainCoverage = await this.loadBrainCoverage(accountId, scope);
    const modelRoute = await this.loadModelRoute(accountId);

    // open_gaps in the run input is what lets the NEXT briefing compute the
    // gap-count delta deterministically — the payload contract has no slot
    // for it, so it rides on the run record instead. company_key is how both
    // the next briefing and the Atlas dock tell which company a briefing
    // belongs to (deltas and display never cross companies).
    await this.markRunRunning(job, modelRoute, {
      open_gaps: gaps.total,
      coverage_empty: coverage.filter((entry) => entry.state === "empty").length,
      company_key: scope.companyKey,
    });

    const result = await this.runner.run({
      prompt: buildBriefingPrompt(coverage, brief, competitors, gaps, artifacts, skills, changes, brainCoverage),
      systemPrompt: buildBriefingSystemPrompt(),
      model: modelRoute.model_name,
      maxTurns: 8,
      maxBudgetUsd: briefingBudgetForRoute(modelRoute),
      mcpServers: {},
      allowedTools: [],
      hooks: createAgentHooks({
        accountId,
        agentRunId: job.agent_run_id,
        jobKind: job.kind,
      }),
    });

    // The run must never fail because the model rambled — an unparseable
    // reply degrades to a deterministic briefing built from the same queries.
    const parsed = parseModelJson(result.resultText);
    const core = parsed
      ? sanitizeModelBriefing(parsed, coverage, gaps, skills)
      : buildFallbackBriefing(coverage, gaps);

    const payload: AtlasBriefingPayload = {
      ...core,
      kind: "atlas_briefing_v1",
      coverage,
      brain_coverage: brainCoverage,
      changes,
      generated_at: new Date().toISOString(),
      model: modelRoute.model_name,
    };

    const estimatedCost = result.costUsd ?? estimateCost(result.tokensIn, result.tokensOut, modelRoute);
    if (job.agent_run_id) {
      const { error } = await this.deps.client
        .from("agent_runs")
        .update({
          status: "completed",
          output: payload,
          summary: payload.headline,
          model_provider: modelRoute.provider,
          model_name: modelRoute.model_name,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          estimated_cost: estimatedCost,
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.agent_run_id)
        .eq("account_id", accountId);
      if (error) throw new Error(`Failed to complete atlas briefing run: ${error.message}`);
    }

    await this.writeBriefingDocument(accountId, scope, payload, job.agent_run_id);
  }

  /**
   * Every briefing files itself on the shelf (owner direction 2026-07-14):
   * the strip in the rail is for glancing, the document is for reading and
   * history. Non-fatal — the briefing payload is already durable on the run.
   */
  private async writeBriefingDocument(
    accountId: string,
    scope: CompanyScope,
    payload: AtlasBriefingPayload,
    agentRunId: string | null,
  ): Promise<void> {
    try {
      const date = new Date(payload.generated_at);
      const { error } = await this.deps.client.from("skill_artifacts").insert({
        account_id: accountId,
        skill_key: "atlas.state_of_the_union",
        title: `State of the Union — ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        body_md: briefingMarkdown(payload),
        payload,
        evidence_ids: [],
        business_context_version_id: scope.activeContextId,
        agent_run_id: agentRunId,
      });
      if (error) throw new Error(error.message);
    } catch (error) {
      console.error(`[briefing] shelf document write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadCompanyBrief(accountId: string, scope: CompanyScope): Promise<CompanyBrief | null> {
    if (!scope.activeContextId) return null;
    const { data, error } = await this.deps.client
      .from("business_context_versions")
      .select("company_name, industry, summary")
      .eq("account_id", accountId)
      .in("id", scope.contextIds)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(`Failed to load company brief for briefing: ${error.message}`);
    // Anonymous ensure-rows carry no company fields — brief from the newest
    // NAMED context in the active company's chain.
    const rows = (data ?? []) as CompanyBrief[];
    return rows.find((row) => row.company_name) ?? rows[0] ?? null;
  }

  private async loadCompetitors(accountId: string, scope: CompanyScope): Promise<CompetitorSummary[]> {
    const { data, error } = await this.deps.client
      .from("companies")
      .select("name, website_url")
      .eq("account_id", accountId)
      .eq("is_competitor", true)
      .in("business_context_version_id", scope.contextIds)
      .order("created_at", { ascending: true })
      .limit(6);
    if (error) throw new Error(`Failed to load competitors for briefing: ${error.message}`);
    return (data ?? []) as CompetitorSummary[];
  }

  private async loadRecentArtifacts(accountId: string, scope: CompanyScope): Promise<ArtifactSummary[]> {
    const { data, error } = await this.deps.client
      .from("skill_artifacts")
      .select("title, skill_key, created_at")
      .eq("account_id", accountId)
      .in("business_context_version_id", scope.contextIds)
      .order("created_at", { ascending: false })
      .limit(6);
    if (error) throw new Error(`Failed to load skill artifacts for briefing: ${error.message}`);
    return (data ?? []) as ArtifactSummary[];
  }

  /** AT-5: brain-slot coverage — computed from the manifest; non-fatal. */
  private async loadBrainCoverage(accountId: string, scope: CompanyScope): Promise<BrainCoverageSummary | null> {
    try {
      const report = await loadCoverageReport(this.deps.client, accountId, scope.companyKey);
      return {
        filled: report.filled,
        total: report.total,
        top_gaps: report.gaps.slice(0, 3).map((gap) => ({
          path: gap.path,
          title: gap.title,
          score: gap.score,
          reason: gap.reason,
        })),
      };
    } catch (error) {
      console.error(`[coverage] briefing brain coverage failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async loadPreviousBriefing(accountId: string, scope: CompanyScope): Promise<PreviousBriefing | null> {
    const { data, error } = await this.deps.client
      .from("agent_runs")
      .select("output, input, completed_at")
      .eq("account_id", accountId)
      .eq("run_type", "atlas_briefing")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load previous briefing: ${error.message}`);
    if (!data) return null;

    const output = asRecord((data as Record<string, unknown>).output);
    if (output.kind !== "atlas_briefing_v1") return null;

    // A briefing about a different company is not a baseline — deltas like
    // "gaps went from 20 to 0" across a company switch would be nonsense.
    const previousInput = asRecord((data as Record<string, unknown>).input);
    const previousKey = typeof previousInput.company_key === "string" ? previousInput.company_key : null;
    if (previousKey !== scope.companyKey) return null;

    const coverage = new Map<SectionKey, CoverageState>();
    if (Array.isArray(output.coverage)) {
      for (const entry of output.coverage) {
        const record = asRecord(entry);
        if (isSectionKey(record.section_key) && isCoverageState(record.state)) {
          coverage.set(record.section_key, record.state);
        }
      }
    }
    return {
      coverage,
      generatedAt: typeof output.generated_at === "string" ? output.generated_at : null,
      openGaps: typeof previousInput.open_gaps === "number" ? previousInput.open_gaps : null,
    };
  }

  private async loadModelRoute(accountId: string): Promise<ModelRoute> {
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .or("task_class.eq.atlas_briefing,task_class.eq.workspace_chat,route_key.eq.atlas_briefing")
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load atlas briefing model route: ${error.message}`);

    // The briefing runs on the Claude Agent SDK — only anthropic-provider
    // routes can drive it (RF-LIVE-8). If no atlas_briefing route is seeded
    // yet, borrow the workspace_chat anthropic default rather than failing.
    const candidates = ((data ?? []) as ModelRoute[]).filter((route) => route.provider === "anthropic");
    const route = chooseModelRoute(candidates, accountId, "atlas_briefing", "atlas_briefing")
      ?? chooseModelRoute(candidates, accountId, "atlas_briefing", "workspace_chat");
    if (!route) throw new Error("No anthropic model route configured for atlas_briefing");
    return route;
  }

  private async markRunRunning(job: AgentJob, modelRoute: ModelRoute, input: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client
      .from("agent_runs")
      .update({
        status: "running",
        run_type: "atlas_briefing",
        input,
        model_provider: modelRoute.provider,
        model_name: modelRoute.model_name,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.agent_run_id)
      .eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark atlas briefing run running: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Deterministic context loaders — exported so workspace-chat's orchestrator
// prompt reuses the exact same queries instead of duplicating them.
// ---------------------------------------------------------------------------

export async function loadSectionCoverage(client: SupabaseClient, accountId: string, scope: CompanyScope): Promise<CoverageEntry[]> {
  const { data, error } = await client
    .from("canvas_section_versions")
    .select("section_key, items, created_at")
    .eq("account_id", accountId)
    .is("competitor_id", null)
    .in("business_context_version_id", scope.contextIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load canvas coverage: ${error.message}`);

  // Rows arrive newest-first; the first row per section is its latest version.
  const latest = new Map<SectionKey, unknown>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (isSectionKey(row.section_key) && !latest.has(row.section_key)) {
      latest.set(row.section_key, row.items);
    }
  }

  return SECTION_KEYS.map((sectionKey) => {
    const items = normalizeItems(latest.get(sectionKey));
    if (items.length === 0) return { section_key: sectionKey, state: "empty" as const, items: 0 };
    const assumed = items.filter((item) => ASSUMPTION_PREFIX.test(item)).length;
    // Half or more assumption-labeled items means the section is still a
    // guess, not a grounded read — mirror of src/lib/assumption.ts labeling.
    const state: CoverageState = assumed * 2 >= items.length ? "assumed" : "verified";
    return { section_key: sectionKey, state, items: items.length };
  });
}

export async function loadGapSummary(client: SupabaseClient, accountId: string, scope: CompanyScope): Promise<GapSummary> {
  const { data, error } = await client
    .from("gaps")
    .select("title, severity, status, score")
    .eq("account_id", accountId)
    .in("business_context_version_id", scope.contextIds)
    .not("status", "in", "(resolved,superseded,wont_fix)")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw new Error(`Failed to load gaps for briefing: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const bySeverity: Record<string, number> = {};
  for (const row of rows) {
    const severity = typeof row.severity === "string" ? row.severity : "unknown";
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
  }
  const topTitles = rows
    .map((row) => (typeof row.title === "string" ? row.title : null))
    .filter((title): title is string => Boolean(title))
    .slice(0, 3);
  return { total: rows.length, bySeverity, topTitles };
}

/** Deterministic markdown for the shelf document — same facts as the card. */
export function briefingMarkdown(payload: AtlasBriefingPayload): string {
  const lines: string[] = [`# ${payload.headline}`, ""];
  if (payload.position.length > 0) {
    lines.push("## Where you stand", "");
    for (const claim of payload.position) {
      lines.push(`- **${claim.claim}**${claim.basis ? ` — ${claim.basis}` : ""}`);
    }
    lines.push("");
  }
  if (payload.changes.length > 0) {
    lines.push("## Since last briefing", "");
    for (const change of payload.changes) lines.push(`- ${change}`);
    lines.push("");
  }
  const verified = payload.coverage.filter((entry) => entry.state === "verified").length;
  const covered = payload.coverage.filter((entry) => entry.state !== "empty").length;
  lines.push(
    "## Canvas coverage",
    "",
    `${covered} of ${payload.coverage.length} sections have content; ${verified} verified.`,
    "",
  );
  if (payload.brain_coverage && payload.brain_coverage.total > 0) {
    lines.push("## Business brain", "", `${payload.brain_coverage.filled} of ${payload.brain_coverage.total} slots filled.`);
    if (payload.brain_coverage.top_gaps.length > 0) {
      lines.push("", "Highest-value gaps:");
      for (const gap of payload.brain_coverage.top_gaps) {
        lines.push(`- ${gap.title} (${gap.reason === "stale" ? "needs refresh" : "missing"})`);
      }
    }
    lines.push("");
  }
  if (payload.directive.action) {
    lines.push("## The one move", "", payload.directive.action);
    if (payload.directive.why) lines.push("", `**Why:** ${payload.directive.why}`);
    lines.push("");
  }
  if (payload.watchouts.length > 0) {
    lines.push("## Watchouts", "");
    for (const watchout of payload.watchouts) lines.push(`- ${watchout}`);
    lines.push("");
  }
  lines.push("---", "", `Generated ${payload.generated_at}`);
  return lines.join("\n");
}

export async function loadImplementedSkills(client: SupabaseClient): Promise<ImplementedSkill[]> {
  // skill_catalog is a global registry (no account_id column) — the
  // implemented flag is the honesty gate: Atlas may only direct users to
  // skills the worker can actually execute (rule B2).
  const { data, error } = await client
    .from("skill_catalog")
    .select("skill_key, agent_key, title")
    .eq("implemented", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to load skill catalog for briefing: ${error.message}`);
  return (data ?? []) as ImplementedSkill[];
}

export function formatCoverageSummary(coverage: CoverageEntry[]): string {
  const lines = coverage.map((entry) => {
    const label = SECTION_LABELS[entry.section_key];
    return `- ${label} (${entry.section_key}): ${entry.state} — ${entry.items} item${entry.items === 1 ? "" : "s"}`;
  });
  return `Canvas coverage (9 sections, computed from the database):\n${lines.join("\n")}`;
}

export function formatGapSummary(gaps: GapSummary): string {
  if (gaps.total === 0) return "Open gaps: none on the register.";
  const severities = Object.entries(gaps.bySeverity)
    .map(([severity, count]) => `${count} ${severity}`)
    .join(", ");
  const top = gaps.topTitles.length > 0 ? ` Top: ${gaps.topTitles.join("; ")}.` : "";
  return `Open gaps: ${gaps.total} (${severities}).${top}`;
}

export function formatSkillList(skills: ImplementedSkill[]): string {
  if (skills.length === 0) return "Implemented skills: none yet — the only runnable action is a section analysis.";
  const lines = skills.map((skill) => {
    const sectionKey = sectionKeyForAgentKey(skill.agent_key);
    const room = sectionKey ? `${SECTION_LABELS[sectionKey]} (${sectionKey})` : skill.agent_key;
    return `- ${skill.skill_key} — "${skill.title}" — room: ${room}`;
  });
  return `Implemented, runnable skills (the ONLY skills you may name):\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function buildBriefingSystemPrompt(): string {
  return `You are Atlas, the chief strategist for a business-model-canvas workspace. You produce a "State of the Union" briefing for the owner: where they sit, what the data holds, and the single next move.

Return ONLY a JSON object — no prose before or after, no code fences — with exactly these keys:
- "headline": one sentence, the strategist's opener.
- "position": up to 4 objects of { "claim": string, "basis": string }. Every claim must be supported by the provided data and NOTHING else; the basis must name the specific provided fact (a section's coverage state, a competitor, a gap, an artifact). Never assert a market standing the data cannot support — name unknowns as gaps instead of ranking by intuition.
- "directive": exactly ONE next action — never a menu — as { "room": <one of the nine section keys or null>, "skill_key": <an implemented skill key or null>, "action": <one imperative sentence>, "why": <what completing it unlocks strategically> }. Name either one skill from the implemented list (room must be that skill's room) or a section analysis for a named weak section (skill_key null).
- "watchouts": up to 2 short strings.

The nine section keys: ${SECTION_KEYS.join(", ")}.
If the account holds almost no data, say so plainly in the headline and direct the user to the single highest-leverage first step.`;
}

function buildBriefingPrompt(
  coverage: CoverageEntry[],
  brief: CompanyBrief | null,
  competitors: CompetitorSummary[],
  gaps: GapSummary,
  artifacts: ArtifactSummary[],
  skills: ImplementedSkill[],
  changes: string[],
  brainCoverage: BrainCoverageSummary | null = null,
): string {
  const blocks: string[] = [];
  if (brief && (brief.company_name || brief.industry || brief.summary)) {
    const lines: string[] = [];
    if (brief.company_name) lines.push(`Company: ${brief.company_name}`);
    if (brief.industry) lines.push(`Industry: ${brief.industry}`);
    if (brief.summary) lines.push(`Summary: ${truncate(brief.summary.trim(), 600)}`);
    blocks.push(lines.join("\n"));
  } else {
    blocks.push("Company: unknown — no business context captured yet.");
  }
  blocks.push(formatCoverageSummary(coverage));
  if (brainCoverage && brainCoverage.total > 0) {
    const gapLines = brainCoverage.top_gaps
      .map((gap) => `- ${gap.title} (${gap.path}, ${gap.reason}, score ${gap.score})`)
      .join("\n");
    blocks.push(
      `Business brain coverage (computed — never restate different numbers): ${brainCoverage.filled} of ${brainCoverage.total} slots filled.` +
        (gapLines ? `\nHighest-value gaps to fill next:\n${gapLines}` : ""),
    );
  }
  blocks.push(competitors.length > 0
    ? `Tracked competitors:\n${competitors.map((competitor) => `- ${competitor.name}${competitor.website_url ? ` (${competitor.website_url})` : ""}`).join("\n")}`
    : "Tracked competitors: none yet.");
  blocks.push(formatGapSummary(gaps));
  blocks.push(artifacts.length > 0
    ? `Recent skill artifacts:\n${artifacts.map((artifact) => `- "${truncate(artifact.title, 120)}" (${artifact.skill_key}, ${artifact.created_at})`).join("\n")}`
    : "Recent skill artifacts: none yet.");
  blocks.push(formatSkillList(skills));
  if (changes.length > 0) blocks.push(`Changes since the previous briefing:\n${changes.map((change) => `- ${change}`).join("\n")}`);
  return `Produce the State of the Union briefing from this data and nothing else.\n\n${blocks.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Deterministic deltas + validation/fallback
// ---------------------------------------------------------------------------

function computeChanges(
  coverage: CoverageEntry[],
  gaps: GapSummary,
  artifacts: ArtifactSummary[],
  previous: PreviousBriefing | null,
): string[] {
  if (!previous) return [];
  const changes: string[] = [];
  for (const entry of coverage) {
    const before = previous.coverage.get(entry.section_key);
    if (before === "empty" && entry.state !== "empty") {
      changes.push(`${SECTION_LABELS[entry.section_key]} moved from empty to ${entry.state} (${entry.items} items)`);
    }
  }
  if (previous.openGaps !== null && previous.openGaps !== gaps.total) {
    changes.push(`Open gaps went from ${previous.openGaps} to ${gaps.total}`);
  }
  if (previous.generatedAt) {
    for (const artifact of artifacts) {
      if (artifact.created_at > previous.generatedAt) {
        changes.push(`New artifact: "${truncate(artifact.title, 120)}" (${artifact.skill_key})`);
      }
    }
  }
  return changes;
}

/** Strip fences / surrounding prose and parse the first balanced JSON object. */
function parseModelJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```[a-z]*\s*\n([\s\S]*?)\n```/);
  const source = fenced ? fenced[1] : trimmed;
  const start = source.indexOf("{");
  if (start === -1) return null;
  const length = balancedJsonLength(source.slice(start));
  if (length === 0) return null;
  try {
    const parsed = JSON.parse(source.slice(start, start + length)) as unknown;
    const record = asRecord(parsed);
    return Object.keys(record).length > 0 ? record : null;
  } catch {
    return null;
  }
}

function balancedJsonLength(text: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return 0;
}

type BriefingCore = Pick<AtlasBriefingPayload, "headline" | "position" | "directive" | "watchouts">;

function sanitizeModelBriefing(
  record: Record<string, unknown>,
  coverage: CoverageEntry[],
  gaps: GapSummary,
  skills: ImplementedSkill[],
): BriefingCore {
  const headline = readNonEmptyString(record.headline) ?? fallbackHeadline(coverage, gaps);

  const position: PositionClaim[] = [];
  if (Array.isArray(record.position)) {
    for (const entry of record.position) {
      const claimRecord = asRecord(entry);
      const claim = readNonEmptyString(claimRecord.claim);
      const basis = readNonEmptyString(claimRecord.basis);
      if (claim && basis) position.push({ claim, basis });
      if (position.length >= 4) break;
    }
  }

  const watchouts: string[] = [];
  if (Array.isArray(record.watchouts)) {
    for (const entry of record.watchouts) {
      const watchout = readNonEmptyString(entry);
      if (watchout) watchouts.push(watchout);
      if (watchouts.length >= 2) break;
    }
  }

  return {
    headline,
    position,
    directive: sanitizeDirective(asRecord(record.directive), coverage, skills),
    watchouts,
  };
}

function sanitizeDirective(record: Record<string, unknown>, coverage: CoverageEntry[], skills: ImplementedSkill[]): Directive {
  const action = readNonEmptyString(record.action);
  if (!action) return fallbackDirective(coverage);

  const room: SectionKey | null = isSectionKey(record.room) ? record.room : null;
  let skillKey = readNonEmptyString(record.skill_key);
  if (skillKey) {
    // Rule B2: a directive may only name a skill the worker can execute, and
    // it must live in the room the directive points at — otherwise keep the
    // room and drop the skill so the user is never sent somewhere broken.
    const skill = skills.find((candidate) => candidate.skill_key === skillKey);
    const skillRoom = skill ? sectionKeyForAgentKey(skill.agent_key) : null;
    if (!skill || skillRoom === null || skillRoom !== room) skillKey = null;
  }

  return {
    room,
    skill_key: skillKey,
    action,
    why: readNonEmptyString(record.why) ?? "It fills the biggest hole in the data foundation.",
  };
}

function buildFallbackBriefing(coverage: CoverageEntry[], gaps: GapSummary): BriefingCore {
  const populated = coverage.filter((entry) => entry.state !== "empty");
  const verified = coverage.filter((entry) => entry.state === "verified").length;

  const position: PositionClaim[] = [
    {
      claim: populated.length === 0
        ? "There is no canvas data yet, so no market position can be stated."
        : `${populated.length} of 9 canvas sections hold data; ${verified} are verified.`,
      basis: `Coverage computed from canvas_section_versions: ${populated.length} non-empty of 9 sections.`,
    },
  ];
  if (gaps.total > 0) {
    position.push({
      claim: `${gaps.total} gaps are open on the register.`,
      basis: `Gap register count by severity: ${Object.entries(gaps.bySeverity).map(([severity, count]) => `${count} ${severity}`).join(", ")}.`,
    });
  }

  return {
    headline: fallbackHeadline(coverage, gaps),
    position,
    directive: fallbackDirective(coverage),
    watchouts: [],
  };
}

function fallbackHeadline(coverage: CoverageEntry[], gaps: GapSummary): string {
  const populated = coverage.filter((entry) => entry.state !== "empty").length;
  if (populated === 0) {
    return "The canvas is empty — nothing is known about this business yet, so the first job is getting verified data on the board.";
  }
  const verified = coverage.filter((entry) => entry.state === "verified").length;
  return `${populated} of 9 canvas sections hold data (${verified} verified) and ${gaps.total} gaps are open — the next move below closes the weakest spot.`;
}

function fallbackDirective(coverage: CoverageEntry[]): Directive {
  // The emptiest section is the highest-leverage deterministic first step:
  // first empty section in canonical order, else the thinnest populated one.
  const empty = coverage.find((entry) => entry.state === "empty");
  const target = empty ?? [...coverage].sort((a, b) => a.items - b.items)[0];
  const label = SECTION_LABELS[target.section_key];
  return {
    room: target.section_key,
    skill_key: null,
    action: `Run the ${label} section analysis from the canvas page.`,
    why: `${label} is the weakest section on the board — grounding it gives every later move verified data to stand on.`,
  };
}

// ---------------------------------------------------------------------------
// Small shared utilities
// ---------------------------------------------------------------------------

// Mirror of src/lib/assumption.ts: the "Assumption:" prefix is data, not
// decoration — it is how deck-built canvases label unverified inferences.
const ASSUMPTION_PREFIX = /^assumption[:\-–—]/i;

function normalizeItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      items.push(entry.trim());
      continue;
    }
    const record = asRecord(entry);
    if (typeof record.text === "string" && record.text.trim().length > 0) items.push(record.text.trim());
  }
  return items;
}

function isCoverageState(value: unknown): value is CoverageState {
  return value === "verified" || value === "assumed" || value === "empty";
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function briefingBudgetForRoute(route: ModelRoute): number {
  // Single-shot synthesis over a fully assembled context block on an
  // opus-class route (~60k input, ~8k output); the floor keeps the run
  // viable when route costs are missing.
  const input = route.cost_per_1k_in ?? 0.015;
  const output = route.cost_per_1k_out ?? 0.075;
  return Math.max(1.5, input * 60 + output * 8);
}

function estimateCost(tokensIn: number | null, tokensOut: number | null, route: ModelRoute): number | null {
  if (tokensIn === null && tokensOut === null) return null;
  const inputCost = ((tokensIn ?? 0) / 1000) * (route.cost_per_1k_in ?? 0);
  const outputCost = ((tokensOut ?? 0) / 1000) * (route.cost_per_1k_out ?? 0);
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
