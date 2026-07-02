import type { SupabaseClient } from "@supabase/supabase-js";
import { asRecord } from "../db/json.js";
import type { FeedFetcher, FeedRunInput, FeedRunResult, FeedRuntimeConfig } from "./types.js";
import { createFeedFetchers } from "./fetchers.js";

interface DataFeedRow {
  id: string;
  account_id: string | null;
  feed_key: string;
  config: unknown;
  ttl_seconds: number;
}

interface CacheRow {
  payload: Record<string, unknown>;
  evidence_candidates: unknown;
  metric_candidates: unknown;
  health: "ok" | "degraded" | "failing";
  error: string | null;
  expires_at: string;
}

export interface FeedRefreshRequest {
  accountId: string;
  feedKey: string;
  cacheKey?: string;
  companyName?: string;
  companyUrl?: string;
  query?: string;
  force?: boolean;
}

export class FeedRunner {
  private readonly fetchers: Map<string, FeedFetcher>;

  constructor(
    private readonly client: SupabaseClient,
    config: FeedRuntimeConfig = {},
  ) {
    this.fetchers = createFeedFetchers(config);
  }

  async refresh(request: FeedRefreshRequest): Promise<FeedRunResult> {
    const feed = await this.loadFeed(request.accountId, request.feedKey);
    const cacheKey = request.cacheKey ?? defaultCacheKey(request);

    if (!request.force) {
      const cached = await this.readFreshCache(request.accountId, feed.feed_key, cacheKey);
      if (cached) return cached;
    }

    const fetcher = this.fetchers.get(feed.feed_key);
    if (!fetcher) throw new Error(`No fetcher registered for feed ${feed.feed_key}`);

    const result = await fetcher.run({
      accountId: request.accountId,
      feedKey: feed.feed_key,
      cacheKey,
      config: asRecord(feed.config),
      companyName: request.companyName,
      companyUrl: request.companyUrl,
      query: request.query,
    } satisfies FeedRunInput);

    await this.writeCache(request.accountId, feed, cacheKey, result);
    await this.writeHealth(feed.id, result);
    return result;
  }

  private async loadFeed(accountId: string, feedKey: string): Promise<DataFeedRow> {
    const { data, error } = await this.client
      .from("data_feeds")
      .select("id, account_id, feed_key, config, ttl_seconds")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .eq("feed_key", feedKey)
      .order("account_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load data feed: ${error.message}`);
    if (!data) throw new Error(`Data feed not configured: ${feedKey}`);
    return data as DataFeedRow;
  }

  private async readFreshCache(accountId: string, feedKey: string, cacheKey: string): Promise<FeedRunResult | null> {
    const { data, error } = await this.client
      .from("feed_cache")
      .select("payload, evidence_candidates, metric_candidates, health, error, expires_at")
      .eq("account_id", accountId)
      .eq("feed_key", feedKey)
      .eq("cache_key", cacheKey)
      .eq("health", "ok")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to read feed cache: ${error.message}`);
    if (!data) return null;
    const row = data as CacheRow;
    return {
      health: row.health,
      payload: row.payload,
      evidence: Array.isArray(row.evidence_candidates) ? row.evidence_candidates as never : [],
      metrics: Array.isArray(row.metric_candidates) ? row.metric_candidates as never : [],
      error: row.error ?? undefined,
    };
  }

  private async writeCache(accountId: string, feed: DataFeedRow, cacheKey: string, result: FeedRunResult): Promise<void> {
    const ttlSeconds = result.health === "ok" ? feed.ttl_seconds : 300;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error } = await this.client
      .from("feed_cache")
      .upsert({
        account_id: accountId,
        feed_key: feed.feed_key,
        cache_key: cacheKey,
        payload: result.payload,
        evidence_candidates: result.evidence,
        metric_candidates: result.metrics,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt,
        health: result.health,
        error: result.error ?? null,
      }, { onConflict: "account_id,feed_key,cache_key" });
    if (error) throw new Error(`Failed to write feed cache: ${error.message}`);
  }

  private async writeHealth(feedId: string, result: FeedRunResult): Promise<void> {
    const { error } = await this.client
      .from("data_feeds")
      .update({
        health: result.health,
        last_error: result.error ?? null,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", feedId);
    if (error) throw new Error(`Failed to update feed health: ${error.message}`);
  }
}

function defaultCacheKey(request: FeedRefreshRequest): string {
  return [
    request.feedKey,
    request.companyUrl ?? "",
    request.companyName ?? "",
    request.query ?? "",
  ].join("|");
}
