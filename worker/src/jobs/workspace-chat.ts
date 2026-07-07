import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentTaskLimits } from "../agent/limits.js";
import { createAgentHooks } from "../agent/guardrails.js";
import { ClaudeAgentRunner, type AgentRunner } from "../agent/runner.js";
import { loadCompanyScope, type CompanyScope } from "../db/company-scope.js";
import { asRecord } from "../db/json.js";
import { SECTION_LABELS, sectionKeyForAgentKey, type SectionKey } from "../domain/sections.js";
import type { AgentJob } from "../queue/types.js";
import { createBmcServer } from "../tools/bmc-tools.js";
import {
  formatCoverageSummary,
  formatGapSummary,
  formatSkillList,
  loadGapSummary,
  loadImplementedSkills,
  loadSectionCoverage,
  type CoverageEntry,
  type GapSummary,
  type ImplementedSkill,
} from "./atlas-briefing.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";

interface WorkspaceThread {
  id: string;
  account_id: string;
  agent_profile_id: string;
  title: string | null;
}

interface WorkspaceMessage {
  role: string;
  kind: string;
  content: unknown;
  created_at: string;
}

interface ContextSource {
  id: string;
  type: "file" | "url" | "note" | "evidence_query";
  name: string;
  uri: string | null;
  config: unknown;
}

interface AgentProfile {
  id: string;
  agent_key: string;
  display_name: string | null;
  system_instructions: string | null;
  model_route_key: string | null;
}

interface CanvasSectionSnapshot {
  items: string[];
  notes: string | null;
}

interface CompanyBrief {
  company_name: string | null;
  industry: string | null;
  summary: string | null;
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

interface AtlasBoard {
  coverage: CoverageEntry[];
  gaps: GapSummary;
  skills: ImplementedSkill[];
}

export interface WorkspaceChatDependencies {
  client: SupabaseClient;
  runner?: AgentRunner;
  xaiApiKey?: string;
  firecrawlApiKey?: string;
  fredApiKey?: string;
  googleTrendsApiKey?: string;
  githubToken?: string;
  taskLimits?: AgentTaskLimits;
}

export class WorkspaceChatHandler {
  private readonly runner: AgentRunner;

  constructor(private readonly deps: WorkspaceChatDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const threadId = readString(payload.thread_id ?? payload.threadId, "workspace_chat payload requires thread_id");

    const thread = await this.loadThread(job.account_id, threadId);
    const profile = await this.loadProfile(job.account_id, thread.agent_profile_id);
    const modelRoute = await this.loadModelRoute(job.account_id, profile);
    const messages = await this.loadMessages(thread.id);
    const contextSources = await this.loadContextSources(job.account_id, profile.id);
    const isOrchestrator = profile.agent_key === "orchestrator";
    const sectionKey = sectionKeyForAgentKey(profile.agent_key) ?? "value_propositions";
    // All canvas/gap reads are confined to the active company's context chain
    // so agents never quote a previously analyzed company's data.
    const scope = await loadCompanyScope(this.deps.client, job.account_id);
    // Atlas has no section of its own — its prompt carries the cross-company
    // board (coverage, gaps, skills) instead of a single canvas snapshot.
    const canvasSnapshot = isOrchestrator
      ? { items: [], notes: null }
      : await this.loadCanvasSection(job.account_id, sectionKey, scope);
    const companyBrief = await this.loadCompanyBrief(job.account_id, scope);
    const systemPrompt = isOrchestrator
      ? buildAtlasChatSystemPrompt(profile, contextSources, companyBrief, await this.loadAtlasBoard(job.account_id, scope))
      : buildChatSystemPrompt(profile, sectionKey, contextSources, canvasSnapshot, companyBrief);

    await this.markRunRunning(job, profile, modelRoute, { threadId: thread.id, messageCount: messages.length });

    const limits = this.deps.taskLimits?.workspaceChat;
    const result = await this.runner.run({
      prompt: buildChatPrompt(messages),
      systemPrompt,
      model: modelRoute.model_name,
      maxTurns: limits?.maxTurns ?? 40,
      maxBudgetUsd: limits?.maxBudgetUsd ?? budgetForRoute(modelRoute),
      taskBudgetTokens: limits?.taskBudgetTokens,
      mcpServers: {
        bmc: createBmcServer(this.deps.client, {
          accountId: job.account_id,
          agentRunId: job.agent_run_id,
          ownSectionKey: sectionKey,
          agentProfileId: profile.id,
          proposalMode: true,
          // Section agents may launch their own room's implemented skills
          // from chat ("run that pricing teardown" actually runs it). Atlas
          // directs the user to the right room instead of running skills.
          allowSkillRuns: !isOrchestrator,
          xaiApiKey: this.deps.xaiApiKey,
          firecrawlApiKey: this.deps.firecrawlApiKey,
          fredApiKey: this.deps.fredApiKey,
          googleTrendsApiKey: this.deps.googleTrendsApiKey,
          githubToken: this.deps.githubToken,
        }),
      },
      allowedTools: ["mcp__bmc__*"],
      hooks: createAgentHooks({
        accountId: job.account_id,
        agentRunId: job.agent_run_id,
        jobKind: job.kind,
      }),
    });

    const assistantText = stripLeadingToolEcho(result.resultText.trim());
    const { error: messageError } = await this.deps.client.from("workspace_messages").insert({
      thread_id: thread.id,
      role: "agent",
      kind: "text",
      content: { text: assistantText },
      agent_run_id: job.agent_run_id,
    });
    if (messageError) throw new Error(`Failed to write workspace agent message: ${messageError.message}`);

    const estimatedCost = result.costUsd ?? estimateCost(result.tokensIn, result.tokensOut, modelRoute);
    if (job.agent_run_id) {
      const { error } = await this.deps.client
        .from("agent_runs")
        .update({
          status: "completed",
          output: { text: assistantText },
          summary: summarize(assistantText),
          model_provider: modelRoute.provider,
          model_name: modelRoute.model_name,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          estimated_cost: estimatedCost,
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.agent_run_id)
        .eq("account_id", job.account_id);
      if (error) throw new Error(`Failed to complete workspace chat run: ${error.message}`);
    }
  }

  private async loadThread(accountId: string, threadId: string): Promise<WorkspaceThread> {
    const { data, error } = await this.deps.client
      .from("workspace_threads")
      .select("id, account_id, agent_profile_id, title")
      .eq("id", threadId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load workspace thread: ${error.message}`);
    if (!data) throw new Error("Workspace thread not found for job account");
    return data as WorkspaceThread;
  }

  private async loadProfile(accountId: string, profileId: string): Promise<AgentProfile> {
    const { data, error } = await this.deps.client
      .from("agent_profiles")
      .select("id, agent_key, display_name, system_instructions, model_route_key")
      .eq("id", profileId)
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .maybeSingle();
    if (error) throw new Error(`Failed to load workspace agent profile: ${error.message}`);
    if (!data) throw new Error("Workspace agent profile not found for job account");
    return data as AgentProfile;
  }

  private async loadModelRoute(accountId: string, profile: AgentProfile): Promise<ModelRoute> {
    const routeKey = profile.model_route_key ?? "workspace_chat";
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .or(`task_class.eq.workspace_chat,task_class.eq.section_analysis,route_key.eq.${routeKey}`)
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load workspace chat model route: ${error.message}`);

    // Chat runs on the Claude Agent SDK (MCP tools, proposal mode) — only
    // anthropic-provider routes can drive it. Profiles seeded with the legacy
    // 'standard' route (xai/grok) otherwise feed a Grok model name to the
    // Claude CLI, which replies with a model-not-found message as the "agent"
    // (live incident RF-LIVE-8, 2026-07-06). Non-anthropic selections fall
    // back to the anthropic chat/section defaults.
    const candidates = ((data ?? []) as ModelRoute[]).filter((route) => route.provider === "anthropic");
    const route = chooseModelRoute(candidates, accountId, routeKey, "workspace_chat")
      ?? chooseModelRoute(candidates, accountId, routeKey, "section_analysis");
    if (!route) throw new Error("No anthropic model route configured for workspace_chat");
    return route;
  }

  private async loadMessages(threadId: string): Promise<WorkspaceMessage[]> {
    const { data, error } = await this.deps.client
      .from("workspace_messages")
      .select("role, kind, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(30);
    if (error) throw new Error(`Failed to load workspace messages: ${error.message}`);
    return (data ?? []) as WorkspaceMessage[];
  }

  private async loadCanvasSection(accountId: string, sectionKey: SectionKey, scope: CompanyScope): Promise<CanvasSectionSnapshot> {
    const { data, error } = await this.deps.client
      .from("canvas_section_versions")
      .select("items, notes")
      .eq("account_id", accountId)
      .is("competitor_id", null)
      .in("business_context_version_id", scope.contextIds)
      .eq("section_key", sectionKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load canvas section for chat: ${error.message}`);
    return {
      items: normalizeCanvasItems(data?.items),
      notes: typeof data?.notes === "string" && data.notes.trim().length > 0 ? data.notes.trim() : null,
    };
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
    if (error) throw new Error(`Failed to load company brief for chat: ${error.message}`);
    // Anonymous ensure-rows carry no company fields — brief from the newest
    // NAMED context in the active company's chain.
    const rows = (data ?? []) as CompanyBrief[];
    return rows.find((row) => row.company_name) ?? rows[0] ?? null;
  }

  private async loadContextSources(accountId: string, profileId: string): Promise<ContextSource[]> {
    const { data, error } = await this.deps.client
      .from("context_sources")
      .select("id, type, name, uri, config")
      .eq("account_id", accountId)
      .eq("agent_profile_id", profileId)
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(`Failed to load workspace context sources: ${error.message}`);
    return (data ?? []) as ContextSource[];
  }

  private async loadAtlasBoard(accountId: string, scope: CompanyScope): Promise<AtlasBoard> {
    // Same deterministic queries the atlas_briefing job runs — one source of
    // truth for what Atlas is allowed to know about the account (rule B1).
    const [coverage, gaps, skills] = await Promise.all([
      loadSectionCoverage(this.deps.client, accountId, scope),
      loadGapSummary(this.deps.client, accountId, scope),
      loadImplementedSkills(this.deps.client),
    ]);
    return { coverage, gaps, skills };
  }

  private async markRunRunning(job: AgentJob, profile: AgentProfile, modelRoute: ModelRoute, input: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client
      .from("agent_runs")
      .update({
        status: "running",
        agent_profile_id: profile.id,
        run_type: "workspace_chat",
        input,
        model_provider: modelRoute.provider,
        model_name: modelRoute.model_name,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.agent_run_id)
      .eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark workspace chat run running: ${error.message}`);
  }
}

function readString(value: unknown, message: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(message);
}

// Shared verbatim between the section agents and Atlas — the protocol is the
// same discipline at both altitudes (RF-LIVE-21, spec 12).
const DATA_GAP_PROTOCOL = `Data-gap protocol: when the canvas, company brief, and context sources do not hold enough information to answer well, never guess or pad a generic answer. Say plainly that the information is not there yet, then coach the user through closing the gap: (1) name the specific missing information, (2) tell them exactly how to get it — a metric to pull from their books or analytics, a document to upload as a context source, a number to add to this section's Strategic Goals, a question to ask a customer or vendor — and (3) explain what having it unlocks strategically for their business. Treat every data gap as the next step in building their strategy, not a dead end.`;

function buildChatSystemPrompt(
  profile: AgentProfile,
  sectionKey: SectionKey,
  contextSources: ContextSource[] = [],
  canvas: CanvasSectionSnapshot = { items: [], notes: null },
  brief: CompanyBrief | null = null,
): string {
  const sectionLabel = SECTION_LABELS[sectionKey];
  const base = profile.system_instructions?.trim() || `You are ${profile.display_name ?? profile.agent_key}, a strategy workspace agent for ${sectionLabel}.`;
  const sourceBlock = formatContextSources(contextSources);
  return `${base}

You are replying in a workspace chat. Be concise, practical, and cite uncertainty. Use tools for account data beyond what is below instead of inventing facts. If you propose canvas changes, use proposal-mode tool calls rather than claiming changes were applied. Never paste raw JSON, tool output, or code blocks of data into a reply — always translate findings into plain language.

When the user asks you to run one of your room's skills (or agrees to your suggestion to run one), call the run_skill tool — do not merely describe what the skill would produce. One skill run per reply. After the call succeeds, tell the user the run has started, that it takes a few minutes, and that the document will land on this room's shelf. Never claim a skill ran without calling the tool.

${DATA_GAP_PROTOCOL}${formatCompanyBrief(brief)}${formatCanvasSnapshot(sectionLabel, canvas)}${sourceBlock}`;
}

/**
 * Atlas (agent_key 'orchestrator') is not a tenth section room — it is the
 * chief strategist who sees the whole board. Its prompt swaps the single
 * section snapshot for the cross-company coverage/gap/skill picture assembled
 * by the same queries the atlas_briefing job uses (spec 12, rules B1–B5).
 */
function buildAtlasChatSystemPrompt(
  profile: AgentProfile,
  contextSources: ContextSource[],
  brief: CompanyBrief | null,
  board: AtlasBoard,
): string {
  const sourceBlock = formatContextSources(contextSources);
  // Deliberately DROP profile.system_instructions here: every account's
  // orchestrator profile carries the legacy seeded persona whose "Output
  // format" block mandates raw-JSON replies — appending it re-created the
  // raw-JSON-in-chat regression this doctrine forbids. The Atlas identity
  // below fully replaces the template persona.
  void profile;
  return `You are Atlas, the chief strategist for this workspace — the one guide who sees all nine canvas sections, the competitor set, and the Gap Register, and turns them into one ordered path.

Doctrine (binding):
- One directed action at a time. Assess, issue a single next step with its named destination, verify, then issue the next — a menu of options is a failure.
- Direct the user to the named agent rooms and the implemented skills listed below — never to a step the product cannot execute.
- You never edit the canvas yourself; the section specialists propose changes in their own rooms.
- Completion is verified against the database, never claimed. When the user says "done", check the actual state (agent runs, canvas versions, artifacts, gaps) before acknowledging.
- Every directive carries its why: what completing it unlocks strategically.

You are replying in a workspace chat. Be concise, practical, and cite uncertainty. Never paste raw JSON, tool output, or code blocks of data into a reply — always translate findings into plain language.

${DATA_GAP_PROTOCOL}${formatCompanyBrief(brief)}

${formatCoverageSummary(board.coverage)}

${formatGapSummary(board.gaps)}

${formatSkillList(board.skills)}${sourceBlock}`;
}

function formatCompanyBrief(brief: CompanyBrief | null): string {
  if (!brief) return "";
  const lines: string[] = [];
  if (brief.company_name) lines.push(`Company: ${brief.company_name}`);
  if (brief.industry) lines.push(`Industry: ${brief.industry}`);
  if (brief.summary) lines.push(`Summary: ${truncate(brief.summary.trim(), 600)}`);
  if (lines.length === 0) return "";
  return `\n\nCompany brief (the business you are advising):\n${lines.join("\n")}`;
}

function formatCanvasSnapshot(sectionLabel: string, canvas: CanvasSectionSnapshot): string {
  if (canvas.items.length === 0 && !canvas.notes) {
    return `\n\nThe ${sectionLabel} canvas section is currently empty — say so, suggest running the section analysis from the canvas page, and apply the data-gap protocol to whatever the user asks.`;
  }
  const bullets = canvas.items.slice(0, 12).map((item) => `- ${truncate(item, 240)}`).join("\n");
  const notes = canvas.notes ? `\nOwner goals for this section: ${truncate(canvas.notes, 400)}` : "";
  return `\n\nCurrent ${sectionLabel} canvas items (already loaded — do not spend tool calls re-reading them):\n${bullets}${notes}`;
}

function normalizeCanvasItems(value: unknown): string[] {
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

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Models sometimes open a reply by echoing a tool result as a JSON object
 * (fenced or bare) before the actual answer — it rendered as a wall of raw
 * JSON in the thread (owner finding 2026-07-06). Strip a leading JSON block
 * only when real prose follows; a reply that IS just JSON passes through so
 * we never swallow a whole message.
 */
export function stripLeadingToolEcho(text: string): string {
  // Live incident follow-up: models emit slightly-INVALID JSON echoes too
  // (trailing commas, unescaped chars), which JSON.parse rejects and the
  // original guard let through. JSON-shaped is enough: a fenced block whose
  // body starts with "{", or a brace-balanced bare prefix, gets stripped
  // whenever real prose follows.
  const fenced = text.match(/^```[a-z]*\s*\n([\s\S]*?)\n```\s*/);
  if (fenced && fenced[1].trimStart().startsWith("{")) {
    const rest = text.slice(fenced[0].length).trim();
    if (rest.length >= 40) return rest;
  }
  if (text.startsWith("{")) {
    const prefixLength = balancedJsonPrefixLength(text);
    if (prefixLength > 0) {
      const rest = text.slice(prefixLength).trim();
      if (rest.length >= 40) return rest;
    }
  }
  return text;
}

function balancedJsonPrefixLength(text: string): number {
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

function formatContextSources(sources: ContextSource[]): string {
  if (sources.length === 0) return "";
  let remaining = 4000;
  const rendered: string[] = [];
  for (const source of sources) {
    if (remaining <= 0) break;
    const body = contextSourceBody(source);
    const label = `[S${rendered.length + 1}] ${source.name} (${source.type})`;
    const entry = body ? `${label}\n${body}` : label;
    const trimmed = entry.length > remaining ? `${entry.slice(0, Math.max(0, remaining - 15)).trimEnd()} [truncated]` : entry;
    rendered.push(trimmed);
    remaining -= trimmed.length + 2;
  }
  if (rendered.length === 0) return "";
  return `\n\nEnabled workspace context sources. Cite these as [S1], [S2], etc.; keep them distinct from web evidence citations like [1].\n${rendered.join("\n\n")}`;
}

function contextSourceBody(source: ContextSource): string {
  const config = asRecord(source.config);
  if (source.type === "note" && typeof config.text === "string") return config.text.trim();
  if (source.type === "url") return source.uri ? `URL: ${source.uri}` : "";
  if (source.type === "file") return source.uri ? `File: ${source.uri}` : "";
  return source.uri ?? "";
}

function buildChatPrompt(messages: WorkspaceMessage[]): string {
  const transcript = messages.map((message) => `${message.role}: ${messageText(message.content)}`).join("\n");
  return `Continue this workspace chat. Answer the latest user message and preserve context.\n\n${transcript}`;
}

function messageText(content: unknown): string {
  const record = asRecord(content);
  if (typeof record.text === "string") return record.text;
  return JSON.stringify(content);
}

function budgetForRoute(route: ModelRoute): number {
  // A chat turn with tool use accumulates the system prompt + transcript on
  // every agentic step, so the old ~$0.13 ceiling tripped error_max_budget_usd
  // mid-answer (live incident RF-LIVE-19, 2026-07-06). Budget for ~150k
  // cumulative input tokens and ~8k output, with a floor that survives
  // missing route costs.
  const input = route.cost_per_1k_in ?? 0.003;
  const output = route.cost_per_1k_out ?? 0.015;
  return Math.max(0.75, input * 150 + output * 8);
}

function estimateCost(tokensIn: number | null, tokensOut: number | null, route: ModelRoute): number | null {
  if (tokensIn === null && tokensOut === null) return null;
  const inputCost = ((tokensIn ?? 0) / 1000) * (route.cost_per_1k_in ?? 0);
  const outputCost = ((tokensOut ?? 0) / 1000) * (route.cost_per_1k_out ?? 0);
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}

function summarize(text: string): string {
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
}
