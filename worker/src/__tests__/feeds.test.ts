import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFeedFetchers } from "../feeds/fetchers.js";
import { FeedRunner } from "../feeds/feed-runner.js";
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
      evidence: [
        { title: "Live search: Acme analytics (1)", sourceType: "news", sourceName: "Grok Live Search", sourceUrl: "https://news.example/acme-analytics" },
        { title: "Live search: Acme analytics (2)", sourceType: "news", sourceName: "Grok Live Search", sourceUrl: "https://acme.example/blog/enterprise-analytics" },
      ],
    });
    expect(result?.evidence[0]?.excerpt).toContain("enterprise analytics product");
    const fetchMock = fetch as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } };
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      search_parameters: { mode: "on", return_citations: true },
    });
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
  it("does not serve degraded cache rows after a later successful configuration", async () => {
    const client = new FeedRunnerFakeClient();
    const keylessRunner = new FeedRunner(client.asSupabase(), { fetch: fixtureFetch("github-repo.json") });

    await expect(keylessRunner.refresh({
      accountId: "account-1",
      feedKey: "github_repo_stats",
      cacheKey: "repo",
      force: true,
    })).resolves.toMatchObject({ health: "degraded" });

    expect(client.cacheRows[0]?.health).toBe("degraded");
    expect(Date.parse(client.cacheRows[0]?.expires_at ?? "") - Date.now()).toBeLessThanOrEqual(300_500);

    const fetch = fixtureFetch("github-repo.json");
    const configuredRunner = new FeedRunner(client.asSupabase(), { githubToken: "github-token", fetch });
    const refreshed = await configuredRunner.refresh({
      accountId: "account-1",
      feedKey: "github_repo_stats",
      cacheKey: "repo",
    });
    expect(refreshed.health).toBe("ok");
    expect(refreshed.metrics).toContainEqual(expect.objectContaining({ metricKey: "github.stars", value: 42 }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("serves ok cache rows within TTL without refetching", async () => {
    const client = new FeedRunnerFakeClient();
    client.cacheRows.push({
      account_id: "account-1",
      feed_key: "github_repo_stats",
      cache_key: "repo",
      health: "ok",
      payload: { cached: true },
      evidence_candidates: [{ title: "Cached repo", sourceType: "api" }],
      metric_candidates: [{ metricKey: "github.stars", value: 99 }],
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      error: null,
    });
    const fetch = vi.fn(async () => {
      throw new Error("should not refetch");
    });
    const runner = new FeedRunner(client.asSupabase(), { githubToken: "github-token", fetch });

    await expect(runner.refresh({
      accountId: "account-1",
      feedKey: "github_repo_stats",
      cacheKey: "repo",
    })).resolves.toMatchObject({ health: "ok", payload: { cached: true }, metrics: [{ metricKey: "github.stars", value: 99 }] });
    expect(fetch).not.toHaveBeenCalled();
  });

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

interface CacheFixtureRow {
  account_id: string;
  feed_key: string;
  cache_key: string;
  payload: Record<string, unknown>;
  evidence_candidates: unknown[];
  metric_candidates: unknown[];
  health: "ok" | "degraded" | "failing";
  error: string | null;
  expires_at: string;
}

class FeedRunnerFakeClient {
  public cacheRows: CacheFixtureRow[] = [];

  asSupabase(): never {
    return this as never;
  }

  from(table: string): FeedRunnerFakeQuery {
    return new FeedRunnerFakeQuery(this, table);
  }
}

class FeedRunnerFakeQuery {
  private readonly filters = new Map<string, unknown>();
  private gtFilter: [string, string] | null = null;
  private upsertValue: CacheFixtureRow | null = null;

  constructor(
    private readonly client: FeedRunnerFakeClient,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  or(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.set(column, value);
    return this;
  }

  gt(column: string, value: string): this {
    this.gtFilter = [column, value];
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  upsert(value: CacheFixtureRow): Promise<{ error: null }> {
    this.upsertValue = value;
    const existingIndex = this.client.cacheRows.findIndex((row) =>
      row.account_id === value.account_id
      && row.feed_key === value.feed_key
      && row.cache_key === value.cache_key);
    if (existingIndex >= 0) this.client.cacheRows[existingIndex] = value;
    else this.client.cacheRows.push(value);
    return Promise.resolve({ error: null });
  }

  update(): this {
    return this;
  }

  maybeSingle(): Promise<{ data: unknown; error: null }> {
    if (this.table === "data_feeds") {
      return Promise.resolve({
        data: {
          id: "feed-1",
          account_id: null,
          feed_key: this.filters.get("feed_key"),
          config: { repos: ["owner/repo"] },
          ttl_seconds: 604800,
        },
        error: null,
      });
    }

    if (this.table === "feed_cache") {
      const row = this.client.cacheRows.find((candidate) =>
        candidate.account_id === this.filters.get("account_id")
        && candidate.feed_key === this.filters.get("feed_key")
        && candidate.cache_key === this.filters.get("cache_key")
        && candidate.health === this.filters.get("health")
        && (!this.gtFilter || candidate.expires_at > this.gtFilter[1]));
      return Promise.resolve({ data: row ?? null, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }
}
