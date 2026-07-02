import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
    await expect(fetchers.get("google_trends")?.run(baseInput("google_trends")))
      .resolves.toMatchObject({ health: "degraded", error: "GOOGLE_TRENDS_API_KEY is not configured" });
    await expect(fetchers.get("github_repo_stats")?.run(baseInput("github_repo_stats")))
      .resolves.toMatchObject({ health: "degraded", error: "GITHUB_TOKEN is not configured" });
  });

  it("normalizes Firecrawl scrape fixtures into website evidence", async () => {
    const fetch = fixtureFetch("firecrawl-scrape.json");
    const fetchers = createFeedFetchers({ firecrawlApiKey: "firecrawl-key", fetch });

    const result = await fetchers.get("firecrawl_scrape")?.run({
      ...baseInput("firecrawl_scrape"),
      companyUrl: "https://acme.example/pricing",
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "Acme page scrape", sourceType: "website", sourceUrl: "https://acme.example/pricing" }],
    });
    expect(result?.evidence[0]?.excerpt).toContain("Pro plan for $29");
  });

  it("normalizes Grok live-search fixtures into news evidence", async () => {
    const fetch = fixtureFetch("grok-live-search.json");
    const fetchers = createFeedFetchers({ xaiApiKey: "xai-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({
      ...baseInput("grok_live_search"),
      query: "Acme analytics",
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "Live search: Acme analytics", sourceType: "news", sourceName: "Grok Live Search" }],
    });
    expect(result?.evidence[0]?.excerpt).toContain("enterprise analytics product");
  });

  it("normalizes FRED fixtures into API evidence and metrics", async () => {
    const fetch = fixtureFetch("fred-series.json");
    const fetchers = createFeedFetchers({ fredApiKey: "fred-key", fetch });

    const result = await fetchers.get("fred_series")?.run({
      ...baseInput("fred_series"),
      config: { series: ["FEDFUNDS"] },
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "FRED FEDFUNDS", sourceType: "api", sourceDate: "2026-06-01" }],
      metrics: [{ metricKey: "fred.FEDFUNDS", value: 4.25, label: "FEDFUNDS" }],
    });
  });

  it("normalizes Google Trends fixtures into interest evidence and metrics", async () => {
    const fetch = fixtureFetch("google-trends.json");
    const fetchers = createFeedFetchers({ googleTrendsApiKey: "trends-key", fetch });

    const result = await fetchers.get("google_trends")?.run({
      ...baseInput("google_trends"),
      config: { keyword: "Acme" },
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "Google Trends interest: Acme", sourceType: "api", sourceName: "Google Trends" }],
      metrics: [{ metricKey: "google_trends.interest", value: 72, label: "Acme" }],
    });
  });

  it("normalizes GDELT timeline-count fixtures into a news-volume metric", async () => {
    const fetch = fixtureFetch("gdelt-count.json");
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

  it("normalizes GitHub repo fixtures into evidence and metrics", async () => {
    const fetch = fixtureFetch("github-repo.json");
    const fetchers = createFeedFetchers({ githubToken: "github-token", fetch });

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

function fixtureFetch(fileName: string) {
  return vi.fn(async () => new Response(readFixture(fileName), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
}

function readFixture(fileName: string): string {
  const fixtureUrl = new URL(`./fixtures/${fileName}`, import.meta.url);
  return readFileSync(fileURLToPath(fixtureUrl), "utf8");
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
