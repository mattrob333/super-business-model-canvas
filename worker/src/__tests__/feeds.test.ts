import { describe, expect, it, vi } from "vitest";
import { createFeedFetchers } from "../feeds/fetchers.js";
import { FeedRefreshHandler } from "../jobs/feed-refresh.js";

describe("feed fetchers", () => {
  it("gracefully degrades API-key backed feeds when env is missing", async () => {
    const fetchers = createFeedFetchers();

    await expect(fetchers.get("firecrawl_scrape")?.run(baseInput("firecrawl_scrape")))
      .resolves.toMatchObject({ health: "degraded", error: "FIRECRAWL_API_KEY is not configured" });
    await expect(fetchers.get("grok_live_search")?.run(baseInput("grok_live_search")))
      .resolves.toMatchObject({ health: "degraded", error: "XAI_API_KEY is not configured" });
    await expect(fetchers.get("fred_series")?.run(baseInput("fred_series")))
      .resolves.toMatchObject({ health: "degraded", error: "FRED_API_KEY is not configured" });
  });

  it("normalizes GitHub repo stats into evidence and metrics", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      stargazers_count: 42,
      forks_count: 7,
    }), { status: 200 }));
    const fetchers = createFeedFetchers({ fetch });

    const result = await fetchers.get("github_repo_stats")?.run({
      ...baseInput("github_repo_stats"),
      config: { repos: ["owner/repo"] },
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "GitHub repo stats: owner/repo", sourceType: "api" }],
      metrics: [
        { metricKey: "github.stars", value: 42, label: "owner/repo" },
        { metricKey: "github.forks", value: 7, label: "owner/repo" },
      ],
    });
  });

  it("normalizes GDELT timeline counts into a news-volume metric", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      timeline: [{ value: 2 }, { value: 3 }],
    }), { status: 200 }));
    const fetchers = createFeedFetchers({ fetch });

    const result = await fetchers.get("gdelt_count")?.run({
      ...baseInput("gdelt_count"),
      query: "Acme AI",
    });

    expect(result).toMatchObject({
      health: "ok",
      metrics: [{ metricKey: "gdelt.news_volume", value: 5, label: "Acme AI" }],
    });
  });
});

describe("FeedRefreshHandler", () => {
  it("requires an active scheduled loop matching feed_refresh:<feed_key>", async () => {
    const client = new FakeSupabaseClient();
    const handler = new FeedRefreshHandler({
      client: client.asSupabase(),
      feedRunner: {
        async refresh() {
          throw new Error("should not run");
        },
      } as never,
    });

    await expect(handler.handle({
      id: "job-1",
      account_id: "account-1",
      kind: "feed_refresh",
      payload: { feed_key: "github_repo_stats" },
      status: "running",
      attempts: 1,
      max_attempts: 3,
      agent_run_id: null,
      parent_run_id: null,
      cascade_run_id: null,
      claimed_by: "worker-a",
      locked_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      run_after: new Date().toISOString(),
      last_error: null,
      created_at: new Date().toISOString(),
    })).rejects.toThrow("No active scheduled loop authorizes feed_refresh:github_repo_stats");
  });
});

function baseInput(feedKey: string) {
  return {
    accountId: "account-1",
    feedKey,
    cacheKey: "cache-1",
    config: {},
    companyName: "Acme",
  };
}

class FakeSupabaseClient {
  asSupabase(): never {
    return this as never;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(table);
  }
}

class FakeQuery {
  constructor(private readonly table: string) {}

  select(): this {
    return this;
  }

  eq(): this {
    return this;
  }

  limit(): Promise<{ data: unknown[]; error: null }> {
    if (this.table !== "scheduled_loops") throw new Error(`Unexpected table ${this.table}`);
    return Promise.resolve({ data: [], error: null });
  }
}
