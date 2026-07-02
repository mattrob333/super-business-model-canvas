import type { SupabaseClient } from "@supabase/supabase-js";
import { asRecord } from "../db/json.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import type { FeedRuntimeConfig } from "../feeds/types.js";
import type { AgentJob } from "../queue/types.js";

export interface FeedRefreshDependencies extends FeedRuntimeConfig {
  client: SupabaseClient;
  feedRunner?: FeedRunner;
}

export class FeedRefreshHandler {
  private readonly runner: FeedRunner;

  constructor(private readonly deps: FeedRefreshDependencies) {
    this.runner = deps.feedRunner ?? new FeedRunner(deps.client, deps);
  }

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const feedKey = readString(payload.feed_key ?? payload.feedKey, "feed_refresh payload requires feed_key");
    const actionKey = `feed_refresh:${feedKey}`;
    await this.ensureScheduledLoopAllows(job.account_id, actionKey);

    await this.runner.refresh({
      accountId: job.account_id,
      feedKey,
      cacheKey: readOptionalString(payload.cache_key ?? payload.cacheKey),
      companyName: readOptionalString(payload.company_name ?? payload.companyName),
      companyUrl: readOptionalString(payload.company_url ?? payload.companyUrl),
      query: readOptionalString(payload.query),
      force: payload.force === true,
    });
  }

  private async ensureScheduledLoopAllows(accountId: string, actionKey: string): Promise<void> {
    const { data, error } = await this.deps.client
      .from("scheduled_loops")
      .select("id")
      .eq("account_id", accountId)
      .eq("action_key", actionKey)
      .eq("status", "active")
      .limit(1);
    if (error) throw new Error(`Failed to check feed schedule: ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error(`No active scheduled loop authorizes ${actionKey}`);
    }
  }
}

function readString(value: unknown, message: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(message);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
