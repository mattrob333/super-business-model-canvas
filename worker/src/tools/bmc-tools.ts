import { createSdkMcpServer, tool, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadCompanyScope } from "../db/company-scope.js";
import { SECTION_KEYS, type SectionKey } from "../domain/sections.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import type { FeedRuntimeConfig } from "../feeds/types.js";

export interface ToolContext {
  accountId: string;
  agentRunId: string | null;
  ownSectionKey: SectionKey;
  agentProfileId: string;
  proposalMode: boolean;
  /** When true (workspace chat, section agents only) the agent may enqueue its own room's implemented skills. */
  allowSkillRuns?: boolean;
  xaiApiKey?: string;
  xaiModel?: string;
  firecrawlApiKey?: string;
  fredApiKey?: string;
  googleTrendsApiKey?: string;
  githubToken?: string;
  feedRunner?: FeedRunner;
}

const sectionKeySchema = z.enum(SECTION_KEYS as [SectionKey, ...SectionKey[]]);

const evidenceItemSchema = z.object({
  text: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence_ids: z.array(z.string().uuid()).default([]),
});

export function createBmcServer(client: SupabaseClient, ctx: ToolContext): McpServerConfig {
  const feedRunner = ctx.feedRunner ?? new FeedRunner(client, feedConfigFromContext(ctx));

  const readCanvas = tool(
    "read_canvas",
    "Read current Business Model Canvas items for a section. Always scoped to the active company.",
    {
      section_key: sectionKeySchema,
      include_evidence: z.boolean().default(false),
    },
    async (args) => {
      const scope = await loadCompanyScope(client, ctx.accountId);
      const { data, error } = await client
        .from("canvas_section_versions")
        .select("id, section_key, section_title, items, notes, confidence, created_at")
        .eq("account_id", ctx.accountId)
        .is("competitor_id", null)
        .in("business_context_version_id", scope.contextIds)
        .eq("section_key", args.section_key)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return toolError(`read_canvas failed: ${error.message}`);
      return toolResult({ rows: data ?? [], include_evidence: args.include_evidence });
    },
    { annotations: { readOnlyHint: true } },
  );

  const writeSectionItems = tool(
    "write_section_items",
    "Propose replacement items for your own section. High-confidence items require evidence_ids.",
    {
      section_key: sectionKeySchema,
      items: z.array(evidenceItemSchema),
      notes: z.string().default(""),
      business_context_version_id: z.string().uuid().optional(),
    },
    async (args) => {
      if (args.section_key !== ctx.ownSectionKey) {
        return toolError("DENIED: section agents may not write outside their own section.");
      }

      const violation = args.items.find((item) => item.confidence >= 0.7 && item.evidence_ids.length === 0);
      if (violation) {
        return toolError("DENIED: confidence >= 0.7 requires at least one evidence_id.");
      }

      if (ctx.proposalMode || !args.business_context_version_id) {
        return toolResult({
          proposal: true,
          section_key: args.section_key,
          items: args.items,
          notes: args.notes,
        });
      }

      // The context id is model-supplied — verify it belongs to this account
      // before writing (service-role client: account scoping in code is the
      // only tenant boundary).
      const { data: contextRow, error: contextError } = await client
        .from("business_context_versions")
        .select("id")
        .eq("account_id", ctx.accountId)
        .eq("id", args.business_context_version_id)
        .limit(1)
        .maybeSingle();
      if (contextError) return toolError(`write_section_items failed: ${contextError.message}`);
      if (!contextRow) {
        return toolError("DENIED: business_context_version_id does not belong to this account.");
      }

      const { data, error } = await client
        .from("canvas_section_versions")
        .insert({
          account_id: ctx.accountId,
          business_context_version_id: args.business_context_version_id,
          section_key: args.section_key,
          items: args.items,
          notes: args.notes,
          confidence: averageConfidence(args.items),
          created_by_agent_profile_id: ctx.agentProfileId,
        })
        .select("id")
        .single();

      if (error) return toolError(`write_section_items failed: ${error.message}`);
      return toolResult({ proposal: false, canvas_section_version_id: data.id });
    },
    { annotations: { destructiveHint: true } },
  );

  const logEvidence = tool(
    "log_evidence",
    "Log evidence used by this run. Evidence is always scoped to the job account.",
    {
      title: z.string().min(1),
      excerpt: z.string().optional(),
      source_url: z.string().url().optional(),
      source_name: z.string().optional(),
      source_type: z.enum(["website", "filing", "news", "transcript", "social", "api", "document", "manual"]).default("manual"),
      metadata: z.record(z.string(), z.unknown()).default({}),
    },
    async (args) => {
      const { data, error } = await client
        .from("evidence_items")
        .insert({
          account_id: ctx.accountId,
          title: args.title,
          excerpt: args.excerpt ?? null,
          source_url: args.source_url ?? null,
          source_name: args.source_name ?? null,
          source_type: args.source_type,
          metadata: args.metadata,
          created_by_agent_run_id: ctx.agentRunId,
        })
        .select("id")
        .single();

      if (error) return toolError(`log_evidence failed: ${error.message}`);
      return toolResult({ evidence_id: data.id });
    },
  );

  const openGap = tool(
    "open_gap",
    "Open a strategic gap for this account.",
    {
      title: z.string().min(1),
      description: z.string().optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
      affected_sections: z.array(sectionKeySchema).default([]),
      evidence_ids: z.array(z.string().uuid()).default([]),
      recommended_action: z.string().optional(),
    },
    async (args) => {
      const scope = await loadCompanyScope(client, ctx.accountId);
      const { data, error } = await client
        .from("gaps")
        .insert({
          account_id: ctx.accountId,
          business_context_version_id: scope.activeContextId,
          title: args.title,
          description: args.description ?? null,
          severity: args.severity,
          affected_sections: args.affected_sections,
          evidence_ids: args.evidence_ids,
          recommended_action: args.recommended_action ?? null,
          created_by_agent_run_id: ctx.agentRunId,
        })
        .select("id")
        .single();

      if (error) return toolError(`open_gap failed: ${error.message}`);
      return toolResult({ gap_id: data.id });
    },
  );

  const postInsight = tool(
    "post_insight",
    "Post an insight to the account insight bus.",
    {
      severity: z.enum(["info", "notable", "warning", "critical"]).default("info"),
      title: z.string().min(1),
      body: z.string().optional(),
      section_key: sectionKeySchema.optional(),
      tags: z.array(z.string()).default([]),
      evidence_ids: z.array(z.string().uuid()).default([]),
    },
    async (args) => {
      const { data, error } = await client
        .from("insights")
        .insert({
          account_id: ctx.accountId,
          agent_profile_id: ctx.agentProfileId,
          severity: args.severity,
          title: args.title,
          body: args.body ?? null,
          section_key: args.section_key ?? null,
          tags: args.tags,
          evidence_ids: args.evidence_ids,
          agent_run_id: ctx.agentRunId,
        })
        .select("id")
        .single();

      if (error) return toolError(`post_insight failed: ${error.message}`);
      return toolResult({ insight_id: data.id });
    },
  );

  const readCompetitorCanvas = tool(
    "read_competitor_canvas",
    "Read the latest competitor canvas versions. Always scoped to the active company.",
    { competitor_id: z.string().uuid() },
    async (args) => {
      // Company scoping: like read_canvas, competitor reads are confined to
      // the active company's context chain — a previously analyzed company's
      // competitors must never surface in this one (owner bug 2026-07-06).
      const scope = await loadCompanyScope(client, ctx.accountId);
      const { data, error } = await client
        .from("canvas_section_versions")
        .select("id, competitor_id, section_key, section_title, items, notes, confidence, freshness_status, last_verified_at, created_at")
        .eq("account_id", ctx.accountId)
        .eq("competitor_id", args.competitor_id)
        .in("business_context_version_id", scope.contextIds)
        .order("created_at", { ascending: false });

      if (error) return toolError(`read_competitor_canvas failed: ${error.message}`);
      return toolResult({ competitor_id: args.competitor_id, rows: latestBySection(data ?? []) });
    },
    { annotations: { readOnlyHint: true } },
  );

  const searchWeb = tool(
    "search_web",
    "Search the live web through the cached Grok feed when configured. Gracefully degrades when unset.",
    { query: z.string().min(1) },
    async (args) => {
      const result = await feedRunner.refresh({
        accountId: ctx.accountId,
        feedKey: "grok_live_search",
        cacheKey: `tool:search_web:${args.query}`,
        query: args.query,
      });
      return toolResult(feedToolResult(result, { query: args.query }));
    },
    { annotations: { readOnlyHint: true } },
  );

  const firecrawlScrape = tool(
    "firecrawl_scrape",
    "Scrape a URL through the cached Firecrawl feed when configured. Gracefully degrades when unset.",
    { url: z.string().url() },
    async (args) => {
      const result = await feedRunner.refresh({
        accountId: ctx.accountId,
        feedKey: "firecrawl_scrape",
        cacheKey: `tool:firecrawl_scrape:${args.url}`,
        companyUrl: args.url,
      });
      return toolResult(feedToolResult(result, { url: args.url }));
    },
    { annotations: { readOnlyHint: true } },
  );

  // One skill run per reply: the closure lives for one chat turn, so this
  // flag resets naturally on the next message. An agent that fires several
  // skills at once floods the queue and the owner's activity feed.
  let skillRunStartedThisReply = false;

  const runSkill = tool(
    "run_skill",
    "Start one of YOUR OWN room's implemented skills as a background run. The finished document lands on the workspace shelf in a few minutes. Limit: one skill run per reply, and you must tell the user the run has started.",
    { skill_key: z.string().min(1) },
    async (args) => {
      if (skillRunStartedThisReply) {
        return toolError("DENIED: one skill run per reply. Report the run you already started and let it finish.");
      }
      const { data: skill, error: skillError } = await client
        .from("skill_catalog")
        .select("skill_key, agent_key, title, implemented")
        .eq("skill_key", args.skill_key)
        .maybeSingle();
      if (skillError) return toolError(`run_skill failed: ${skillError.message}`);
      if (!skill || !skill.implemented) {
        // Self-correcting denial: name the room's REAL keys so the model's
        // next call succeeds instead of guessing again (live incident
        // 2026-07-07: Vault guessed keys, gave up, hand-wrote the audit).
        const { data: valid } = await client
          .from("skill_catalog")
          .select("skill_key")
          .eq("agent_key", `agent_${ctx.ownSectionKey}`)
          .eq("implemented", true);
        const keys = (valid ?? []).map((row: { skill_key: string }) => row.skill_key);
        return toolError(
          `DENIED: '${args.skill_key}' is not an implemented skill. Your room's exact runnable keys: ${keys.length > 0 ? keys.join(", ") : "none yet"}.`,
        );
      }
      if (skill.agent_key !== `agent_${ctx.ownSectionKey}`) {
        return toolError(`DENIED: '${args.skill_key}' belongs to another room. Direct the user to that agent's workspace instead.`);
      }
      const scope = await loadCompanyScope(client, ctx.accountId);
      if (!scope.activeContextId) {
        return toolError("DENIED: no analyzed company yet — the user must analyze a company before skills can run.");
      }

      const nowIso = new Date().toISOString();
      const { data: run, error: runError } = await client
        .from("agent_runs")
        .insert({
          account_id: ctx.accountId,
          agent_profile_id: ctx.agentProfileId,
          run_type: "skill_run",
          trigger_type: "cascade",
          status: "pending",
          input: {
            skill_key: skill.skill_key,
            business_context_version_id: scope.activeContextId,
            requested_by_run_id: ctx.agentRunId,
          },
          started_at: nowIso,
        })
        .select("id")
        .single();
      if (runError) return toolError(`run_skill failed to create the run: ${runError.message}`);

      const { error: jobError } = await client.from("agent_jobs").insert({
        account_id: ctx.accountId,
        kind: "skill_run",
        payload: {
          skill_key: skill.skill_key,
          business_context_version_id: scope.activeContextId,
          agentProfileId: ctx.agentProfileId,
        },
        status: "queued",
        agent_run_id: run.id,
        run_after: nowIso,
      });
      if (jobError) {
        // Never leave a pending run with no job behind it — that is the exact
        // stuck-forever state the owner already hit once.
        await client
          .from("agent_runs")
          .update({ status: "failed", error: `enqueue failed: ${jobError.message}`, completed_at: new Date().toISOString() })
          .eq("id", run.id)
          .eq("account_id", ctx.accountId);
        return toolError(`run_skill failed to enqueue the job: ${jobError.message}`);
      }

      skillRunStartedThisReply = true;
      return toolResult({
        run_id: run.id,
        skill_key: skill.skill_key,
        title: skill.title,
        status: "queued",
        note: "Tell the user the run has started, that it takes a few minutes, and that the finished document will appear on this room's shelf and in the run queue.",
      });
    },
  );

  return createSdkMcpServer({
    name: "bmc",
    version: "1.0.0",
    tools: [
      readCanvas,
      writeSectionItems,
      logEvidence,
      openGap,
      postInsight,
      readCompetitorCanvas,
      searchWeb,
      firecrawlScrape,
      ...(ctx.allowSkillRuns ? [runSkill] : []),
    ],
  });
}

function feedConfigFromContext(ctx: ToolContext): FeedRuntimeConfig {
  return {
    xaiApiKey: ctx.xaiApiKey,
    xaiModel: ctx.xaiModel,
    firecrawlApiKey: ctx.firecrawlApiKey,
    fredApiKey: ctx.fredApiKey,
    googleTrendsApiKey: ctx.googleTrendsApiKey,
    githubToken: ctx.githubToken,
  };
}

function feedToolResult(result: Awaited<ReturnType<FeedRunner["refresh"]>>, input: Record<string, unknown>) {
  return {
    degraded: result.health !== "ok",
    health: result.health,
    input,
    evidence: result.evidence,
    metrics: result.metrics,
    payload: result.payload,
    error: result.error,
  };
}

function toolResult(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function toolError(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

function latestBySection(rows: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  const latest: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const sectionKey = typeof row.section_key === "string" ? row.section_key : "";
    if (!sectionKey || seen.has(sectionKey)) continue;
    seen.add(sectionKey);
    latest.push(row);
  }
  return latest;
}

function averageConfidence(items: Array<{ confidence: number }>): number | null {
  if (items.length === 0) return null;
  return items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
}
