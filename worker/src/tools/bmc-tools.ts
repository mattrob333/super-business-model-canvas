import { createSdkMcpServer, tool, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SECTION_KEYS, type SectionKey } from "../domain/sections.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import type { FeedRuntimeConfig } from "../feeds/types.js";

export interface ToolContext {
  accountId: string;
  agentRunId: string | null;
  ownSectionKey: SectionKey;
  agentProfileId: string;
  proposalMode: boolean;
  xaiApiKey?: string;
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
    "Read current Business Model Canvas items for a section. Always account-scoped by worker context.",
    {
      section_key: sectionKeySchema,
      include_evidence: z.boolean().default(false),
    },
    async (args) => {
      const { data, error } = await client
        .from("canvas_section_versions")
        .select("id, section_key, section_title, items, notes, confidence, created_at")
        .eq("account_id", ctx.accountId)
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
      const { data, error } = await client
        .from("gaps")
        .insert({
          account_id: ctx.accountId,
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
    "Read a competitor canvas. Stubbed until Phase 4 competitor canvases ship.",
    { competitor_id: z.string().optional() },
    async () => toolResult({ items: [] }),
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

  return createSdkMcpServer({
    name: "bmc",
    version: "1.0.0",
    tools: [readCanvas, writeSectionItems, logEvidence, openGap, postInsight, readCompetitorCanvas, searchWeb, firecrawlScrape],
  });
}

function feedConfigFromContext(ctx: ToolContext): FeedRuntimeConfig {
  return {
    xaiApiKey: ctx.xaiApiKey,
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

function averageConfidence(items: Array<{ confidence: number }>): number | null {
  if (items.length === 0) return null;
  return items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
}
